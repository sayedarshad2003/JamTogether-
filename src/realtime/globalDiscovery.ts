/**
 * Global Cross-Device Room Discovery & Multi-Peer Relay Engine for JamTogether
 * 
 * Enables instant multi-device room discovery, room code resolution, persistent room chat,
 * and live synchronization across different browsers, mobile devices, and computers worldwide
 * on AWS Amplify static hosting.
 *
 * Backed by EMQX Public WebSocket MQTT Broker (wss://broker.emqx.io:8084/mqtt) with Retained Messages.
 */

import { JamRoom, ChatMessage } from '../types/jam.ts';

function textToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function makeConnectPacket(clientId: string): Uint8Array {
  const protocol = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c]);
  const cIdBytes = textToBytes(clientId);
  const payload = new Uint8Array(2 + cIdBytes.length);
  payload[0] = (cIdBytes.length >> 8) & 0xff;
  payload[1] = cIdBytes.length & 0xff;
  payload.set(cIdBytes, 2);

  const remainingLength = protocol.length + payload.length;
  const packet = new Uint8Array(2 + remainingLength);
  packet[0] = 0x10;
  packet[1] = remainingLength;
  packet.set(protocol, 2);
  packet.set(payload, 2 + protocol.length);
  return packet;
}

function makeSubscribePacket(topic: string, packetId = 1): Uint8Array {
  const tBytes = textToBytes(topic);
  const remainingLength = 2 + 2 + tBytes.length + 1;
  const packet = new Uint8Array(2 + remainingLength);
  packet[0] = 0x82;
  packet[1] = remainingLength;
  packet[2] = (packetId >> 8) & 0xff;
  packet[3] = packetId & 0xff;
  packet[4] = (tBytes.length >> 8) & 0xff;
  packet[5] = tBytes.length & 0xff;
  packet.set(tBytes, 6);
  packet[6 + tBytes.length] = 0x00; // QoS 0
  return packet;
}

function makePublishPacket(topic: string, payloadStr: string, retain = false): Uint8Array {
  const tBytes = textToBytes(topic);
  const pBytes = textToBytes(payloadStr);
  const variableHeaderLength = 2 + tBytes.length;
  const remainingLength = variableHeaderLength + pBytes.length;

  const remBytes: number[] = [];
  let rem = remainingLength;
  do {
    let b = rem % 128;
    rem = Math.floor(rem / 128);
    if (rem > 0) b |= 0x80;
    remBytes.push(b);
  } while (rem > 0);

  const packet = new Uint8Array(1 + remBytes.length + remainingLength);
  packet[0] = 0x30 | (retain ? 0x01 : 0x00);
  packet.set(remBytes, 1);
  const topicOffset = 1 + remBytes.length;
  packet[topicOffset] = (tBytes.length >> 8) & 0xff;
  packet[topicOffset + 1] = tBytes.length & 0xff;
  packet.set(tBytes, topicOffset + 2);
  packet.set(pBytes, topicOffset + 2 + tBytes.length);
  return packet;
}

function parsePublishPacket(data: ArrayBuffer | Uint8Array): { topic: string; payload: string } | null {
  const bytes = new Uint8Array(data);
  if ((bytes[0] & 0xf0) !== 0x30) return null;

  let offset = 1;
  while (offset < bytes.length && (bytes[offset] & 0x80) !== 0) {
    offset++;
  }
  offset++;

  if (offset + 2 > bytes.length) return null;
  const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
  const topicStart = offset + 2;
  const payloadOffset = topicStart + topicLen;
  if (payloadOffset > bytes.length) return null;

  const topicBytes = bytes.subarray(topicStart, payloadOffset);
  const payloadBytes = bytes.subarray(payloadOffset);
  return {
    topic: new TextDecoder().decode(topicBytes),
    payload: new TextDecoder().decode(payloadBytes),
  };
}

class GlobalRoomDiscoveryService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private clientId = `jam_disc_${Math.random().toString(36).substring(2, 9)}`;
  private discoveredRoomsMap = new Map<string, JamRoom>();
  private codeToRoomMap = new Map<string, JamRoom>();
  private roomChatMap = new Map<string, ChatMessage[]>();
  private listeners = new Set<(rooms: JamRoom[]) => void>();
  private chatListeners = new Map<string, Set<(messages: ChatMessage[]) => void>>();
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;

  constructor() {
    this.connect();
  }

  public subscribe(listener: (rooms: JamRoom[]) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with any currently known discovered rooms
    listener(this.getDiscoveredRooms());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getDiscoveredRooms(): JamRoom[] {
    return Array.from(this.discoveredRoomsMap.values());
  }

  public getRoomByCode(code: string): JamRoom | null {
    const clean = code.replace(/.*[?&]room=([^&]+).*/, '$1').replace(/^JAM-?/i, '').trim().toUpperCase();
    if (!clean) return null;

    if (this.codeToRoomMap.has(clean)) {
      return this.codeToRoomMap.get(clean)!;
    }

    for (const r of this.discoveredRoomsMap.values()) {
      const rCode = r.roomCode.replace(/^JAM-?/i, '').toUpperCase();
      if (rCode === clean || r.roomId.toLowerCase() === `jam_${clean.toLowerCase()}`) {
        return r;
      }
    }
    return null;
  }

  public getRoomChat(roomId: string): ChatMessage[] {
    return this.roomChatMap.get(roomId) || [];
  }

  public subscribeRoomChat(roomId: string, listener: (messages: ChatMessage[]) => void): () => void {
    if (!this.chatListeners.has(roomId)) {
      this.chatListeners.set(roomId, new Set());
    }
    this.chatListeners.get(roomId)!.add(listener);

    // If we already have retained chat messages for this room, notify listener immediately
    const existing = this.roomChatMap.get(roomId);
    if (existing && existing.length > 0) {
      try {
        listener(existing);
      } catch {}
    }

    return () => {
      const set = this.chatListeners.get(roomId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.chatListeners.delete(roomId);
        }
      }
    };
  }

  private notifyChat(roomId: string, messages: ChatMessage[]) {
    const listeners = this.chatListeners.get(roomId);
    if (listeners) {
      listeners.forEach((l) => {
        try {
          l(messages);
        } catch (err) {
          console.warn('Listener error in room chat discovery:', err);
        }
      });
    }
  }

  private notify() {
    const rooms = this.getDiscoveredRooms();
    this.listeners.forEach((l) => {
      try {
        l(rooms);
      } catch (err) {
        console.warn('Listener error in global discovery:', err);
      }
    });
  }

  private connect() {
    try {
      if (this.socket) {
        try {
          this.socket.close();
        } catch {}
      }

      this.socket = new WebSocket('wss://broker.emqx.io:8084/mqtt', ['mqtt']);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.isConnected = true;
        this.socket?.send(makeConnectPacket(this.clientId) as any);

        setTimeout(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            // Subscribe to all public rooms published with retain
            this.socket.send(makeSubscribePacket('jamtogether/discovery/rooms/+') as any);
            // Subscribe to room codes published with retain
            this.socket.send(makeSubscribePacket('jamtogether/codes/+') as any);
            // Subscribe to retained room chat histories across all rooms
            this.socket.send(makeSubscribePacket('jamtogether/chat/rooms/+') as any);

            // Explicitly purge legacy dummy/mock retained rooms and codes from public broker
            const legacyPurgeTargets = [
              { id: 'room_fkj_masego', code: 'LIVE' },
              { id: 'room_lofi_study', code: 'LOFI' },
              { id: 'room_synthwave', code: 'WAVE' },
              { id: 'room_lofi', code: 'LOFI' },
            ];
            legacyPurgeTargets.forEach((t) => {
              this.socket?.send(makePublishPacket(`jamtogether/discovery/rooms/${t.id}`, '', true) as any);
              this.socket?.send(makePublishPacket(`jamtogether/chat/rooms/${t.id}`, '', true) as any);
              this.socket?.send(makePublishPacket(`jamtogether/codes/${t.code}`, '', true) as any);
              this.socket?.send(makePublishPacket(`jamtogether/codes/JAM-${t.code}`, '', true) as any);
            });
          }
        }, 300);

        // Ping keepalive every 25s
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(new Uint8Array([0xc0, 0x00]) as any);
          }
        }, 25000);
      };

      this.socket.onmessage = (event) => {
        try {
          const parsed = parsePublishPacket(event.data);
          if (!parsed) return;
          const { topic, payload } = parsed;

          // 1. Discovery Rooms topic: jamtogether/discovery/rooms/{roomId}
          if (topic.startsWith('jamtogether/discovery/rooms/')) {
            const parts = topic.split('/');
            const roomId = parts[parts.length - 1];

            if (
              !payload.trim() ||
              payload === 'null' ||
              roomId === 'room_fkj_masego' ||
              roomId === 'room_lofi_study' ||
              roomId === 'room_synthwave' ||
              roomId.includes('dummy') ||
              roomId.includes('sample')
            ) {
              this.discoveredRoomsMap.delete(roomId);
              this.notify();
              return;
            }

            try {
              const roomData = JSON.parse(payload) as JamRoom;
              if (
                roomData &&
                roomData.roomId &&
                roomData.hostUserId !== 'peer_host' &&
                !roomData.name?.toLowerCase().includes('dummy') &&
                !roomData.name?.toLowerCase().includes('sample') &&
                !roomData.name?.toLowerCase().includes('mock') &&
                !roomData.name?.toLowerCase().includes('jam lounge (')
              ) {
                this.discoveredRoomsMap.set(roomData.roomId, roomData);
                const cleanCode = roomData.roomCode.replace(/^JAM-?/i, '').toUpperCase();
                this.codeToRoomMap.set(cleanCode, roomData);
                this.notify();
              }
            } catch {}
          }

          // 2. Room Code topic: jamtogether/codes/{code}
          if (topic.startsWith('jamtogether/codes/')) {
            const parts = topic.split('/');
            const codeKey = parts[parts.length - 1].toUpperCase();

            if (
              codeKey === 'LIVE' ||
              codeKey === 'LOFI' ||
              codeKey === 'WAVE' ||
              codeKey === 'JAM-LIVE' ||
              codeKey === 'JAM-LOFI' ||
              codeKey === 'JAM-WAVE'
            ) {
              this.codeToRoomMap.delete(codeKey);
              this.notify();
              return;
            }

            if (payload.trim() && payload !== 'null') {
              try {
                const roomData = JSON.parse(payload) as JamRoom;
                if (
                  roomData &&
                  roomData.roomId &&
                  roomData.hostUserId !== 'peer_host' &&
                  !roomData.name?.toLowerCase().includes('dummy')
                ) {
                  this.codeToRoomMap.set(codeKey, roomData);
                  this.discoveredRoomsMap.set(roomData.roomId, roomData);
                  this.notify();
                }
              } catch {}
            }
          }

          // 3. Room Chat topic: jamtogether/chat/rooms/{roomId}
          if (topic.startsWith('jamtogether/chat/rooms/')) {
            const parts = topic.split('/');
            const roomId = parts[parts.length - 1];

            if (!payload.trim() || payload === 'null') {
              this.roomChatMap.delete(roomId);
              this.notifyChat(roomId, []);
              return;
            }

            try {
              const msgs = JSON.parse(payload) as ChatMessage[];
              if (Array.isArray(msgs)) {
                this.roomChatMap.set(roomId, msgs);
                this.notifyChat(roomId, msgs);
              }
            } catch {}
          }
        } catch {
          // ignore malformed messages
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
          this.connect();
        }, 3000);
      };

      this.socket.onerror = () => {
        // Socket will close and trigger onclose reconnect
      };
    } catch (e) {
      console.warn('Discovery connection failed:', e);
    }
  }

  /**
   * Broadcasts a room across all devices in real-time.
   * If public, announces to jamtogether/discovery/rooms/{roomId} with retain = true.
   * Always registers the roomCode to jamtogether/codes/{roomCode} with retain = true.
   */
  public broadcastRoom(room: JamRoom) {
    if (!room || !room.roomId) return;
    const cleanCode = room.roomCode.replace(/^JAM-?/i, '').trim().toUpperCase();

    // Cache locally
    this.discoveredRoomsMap.set(room.roomId, room);
    this.codeToRoomMap.set(cleanCode, room);
    this.notify();

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      const payloadStr = JSON.stringify(room);

      // 1. Broadcast by room code for instant Join Code lookup on any device
      const codePkt = makePublishPacket(`jamtogether/codes/${cleanCode}`, payloadStr, true);
      this.socket.send(codePkt as any);

      const fullCodePkt = makePublishPacket(
        `jamtogether/codes/${room.roomCode.toUpperCase()}`,
        payloadStr,
        true
      );
      this.socket.send(fullCodePkt as any);

      // 2. If public, broadcast to discovery rooms for Dashboard live room showcase
      if (!room.isPrivate) {
        const discPkt = makePublishPacket(
          `jamtogether/discovery/rooms/${room.roomId}`,
          payloadStr,
          true
        );
        this.socket.send(discPkt as any);
      }
    } catch (err) {
      console.warn('Failed to broadcast room online:', err);
    }
  }

  /**
   * Broadcasts the persistent room chat history to the MQTT broker with retain = true.
   * This guarantees that any user refreshing or joining the room immediately receives the
   * full chat history directly from the cloud broker even if other peers are not online.
   */
  public broadcastRoomChat(roomId: string, messages: ChatMessage[]) {
    if (!roomId || !Array.isArray(messages)) return;
    const trimmed = messages.slice(-100);
    this.roomChatMap.set(roomId, trimmed);

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      const payloadStr = JSON.stringify(trimmed);
      const pkt = makePublishPacket(`jamtogether/chat/rooms/${roomId}`, payloadStr, true);
      this.socket.send(pkt as any);
    } catch (err) {
      console.warn('Failed to broadcast room chat history:', err);
    }
  }

  /**
   * Clears retained messages when a room is explicitly deleted or closed.
   */
  public unbroadcastRoom(roomId: string, roomCode?: string) {
    this.discoveredRoomsMap.delete(roomId);
    this.roomChatMap.delete(roomId);
    if (roomCode) {
      const clean = roomCode.replace(/^JAM-?/i, '').toUpperCase();
      this.codeToRoomMap.delete(clean);
    }
    this.notify();

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      // Retained message with empty payload clears it in MQTT broker
      const clearPkt = makePublishPacket(`jamtogether/discovery/rooms/${roomId}`, '', true);
      this.socket.send(clearPkt as any);

      const clearChatPkt = makePublishPacket(`jamtogether/chat/rooms/${roomId}`, '', true);
      this.socket.send(clearChatPkt as any);

      if (roomCode) {
        const clean = roomCode.replace(/^JAM-?/i, '').toUpperCase();
        this.socket.send(makePublishPacket(`jamtogether/codes/${clean}`, '', true) as any);
      }
    } catch {}
  }
}

// Global Singleton Instance
export const globalRoomDiscovery = new GlobalRoomDiscoveryService();
