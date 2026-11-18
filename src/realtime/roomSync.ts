/**
 * Real-Time Dual-Mode Sync Layer for JamTogether
 * 
 * 1. Primary: Direct WebSocket to backend server (localhost or App Runner container).
 * 2. Automatic Cloud Relay: Public high-speed MQTT WebSocket broker (wss://broker.emqx.io:8084/mqtt)
 *    when running on static CDN hosts like AWS Amplify Hosting, enabling real-time cross-device
 *    music sync, queue management, chat, and WebRTC voice signaling worldwide with zero server config.
 */

import { UserProfile, RoomMember, JamRoom, QueueItem, PlaybackState, ChatMessage } from '../types/jam.ts';

export interface RealtimeMessage {
  type: string;
  roomId?: string;
  payload?: any;
}

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

function makePublishPacket(topic: string, payloadStr: string): Uint8Array {
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
  packet[0] = 0x30;
  packet.set(remBytes, 1);
  const topicOffset = 1 + remBytes.length;
  packet[topicOffset] = (tBytes.length >> 8) & 0xff;
  packet[topicOffset + 1] = tBytes.length & 0xff;
  packet.set(tBytes, topicOffset + 2);
  packet.set(pBytes, topicOffset + 2 + tBytes.length);
  return packet;
}

function parsePublishPacket(data: ArrayBuffer | Uint8Array): string | null {
  const bytes = new Uint8Array(data);
  if ((bytes[0] & 0xf0) !== 0x30) return null;

  let offset = 1;
  while (offset < bytes.length && (bytes[offset] & 0x80) !== 0) {
    offset++;
  }
  offset++;

  if (offset + 2 > bytes.length) return null;
  const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
  const payloadOffset = offset + 2 + topicLen;
  if (payloadOffset > bytes.length) return null;
  const payloadBytes = bytes.subarray(payloadOffset);
  return new TextDecoder().decode(payloadBytes);
}

export class RoomRealtimeClient {
  public roomId: string;
  public currentUser: UserProfile;
  public onMessageCallback: (msg: RealtimeMessage) => void;
  public onStatusChange: (connected: boolean, mode: 'backend' | 'cloud-relay' | 'disconnected') => void;

  private primarySocket: WebSocket | null = null;
  private cloudSocket: WebSocket | null = null;
  private isDestroyed = false;
  private isCloudRelayMode = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private topic: string;
  private senderId: string;

  constructor(
    roomId: string,
    currentUser: UserProfile,
    onMessage: (msg: RealtimeMessage) => void,
    onStatusChange: (connected: boolean, mode: 'backend' | 'cloud-relay' | 'disconnected') => void
  ) {
    this.roomId = roomId;
    this.currentUser = currentUser;
    this.onMessageCallback = onMessage;
    this.onStatusChange = onStatusChange;
    this.topic = `jamtogether/rooms/${roomId}`;
    this.senderId = `${currentUser.userId}_${Math.random().toString(36).substring(2, 7)}`;

    this.connect();
  }

  private connect() {
    if (this.isDestroyed) return;

    const customWs = ((import.meta as any).env?.VITE_WS_URL || '').trim();
    const isAmplifyHost =
      window.location.hostname.includes('amplifyapp.com') ||
      window.location.hostname.includes('github.io');

    // On Amplify static hosting without custom WS server, jump straight to cloud relay
    if (isAmplifyHost && !customWs) {
      this.connectCloudRelay();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = customWs || `${protocol}//${window.location.host}/ws`;

    try {
      this.primarySocket = new WebSocket(wsUrl);

      this.primarySocket.onopen = () => {
        if (this.isDestroyed) return;
        this.isCloudRelayMode = false;
        this.onStatusChange(true, 'backend');
        this.primarySocket?.send(
          JSON.stringify({
            type: 'room:subscribe',
            roomId: this.roomId,
            payload: {
              userId: this.currentUser.userId,
              username: this.currentUser.username,
              displayName: this.currentUser.displayName,
              avatarUrl: this.currentUser.avatarUrl,
            },
          })
        );
      };

      this.primarySocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.onMessageCallback(msg);
        } catch {
          // ignore
        }
      };

      this.primarySocket.onerror = () => {
        // Fall back to cloud relay
        if (!this.isCloudRelayMode) {
          this.connectCloudRelay();
        }
      };

      this.primarySocket.onclose = () => {
        if (!this.isDestroyed && !this.isCloudRelayMode) {
          this.connectCloudRelay();
        }
      };
    } catch {
      this.connectCloudRelay();
    }
  }

  private connectCloudRelay() {
    if (this.isDestroyed) return;
    this.isCloudRelayMode = true;

    try {
      if (this.cloudSocket) {
        try {
          this.cloudSocket.close();
        } catch {}
      }

      this.cloudSocket = new WebSocket('wss://broker.emqx.io:8084/mqtt', ['mqtt']);
      this.cloudSocket.binaryType = 'arraybuffer';

      this.cloudSocket.onopen = () => {
        if (this.isDestroyed) return;
        this.onStatusChange(true, 'cloud-relay');

        // Connect packet
        const connectPkt = makeConnectPacket(`jam_${this.senderId}`);
        this.cloudSocket?.send(connectPkt as any);

        // Subscribe to room topic
        setTimeout(() => {
          if (this.cloudSocket?.readyState === WebSocket.OPEN) {
            const subPkt = makeSubscribePacket(this.topic);
            this.cloudSocket.send(subPkt as any);

            // Announce presence to all other peers in this room
            this.send({
              type: 'room:peer_joined',
              payload: {
                member: {
                  roomId: this.roomId,
                  userId: this.currentUser.userId,
                  username: this.currentUser.username,
                  displayName: this.currentUser.displayName,
                  avatarUrl: this.currentUser.avatarUrl,
                  role: 'member',
                  isOnline: true,
                  inVoiceChat: false,
                  isMuted: false,
                  isSpeaking: false,
                  joinedAt: Date.now(),
                },
              },
            });
          }
        }, 300);

        // Keepalive ping every 30 seconds
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
          if (this.cloudSocket?.readyState === WebSocket.OPEN) {
            this.cloudSocket.send(new Uint8Array([0xc0, 0x00]) as any); // PINGREQ
          }
        }, 30000);
      };

      this.cloudSocket.onmessage = (event) => {
        try {
          const raw = parsePublishPacket(event.data);
          if (!raw) return;
          const envelope = JSON.parse(raw);

          // Ignore own messages
          if (envelope._senderId === this.senderId) return;

          this.onMessageCallback({
            type: envelope.type,
            roomId: this.roomId,
            payload: envelope.payload,
          });
        } catch {
          // ignore
        }
      };

      this.cloudSocket.onclose = () => {
        this.onStatusChange(false, 'disconnected');
        if (!this.isDestroyed) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.connectCloudRelay();
          }, 3000);
        }
      };
    } catch (e) {
      console.warn('Could not connect to cloud relay:', e);
    }
  }

  public send(msg: RealtimeMessage) {
    if (this.isDestroyed) return;

    if (!this.isCloudRelayMode && this.primarySocket && this.primarySocket.readyState === WebSocket.OPEN) {
      this.primarySocket.send(
        JSON.stringify({
          ...msg,
          roomId: this.roomId,
        })
      );
      return;
    }

    if (this.cloudSocket && this.cloudSocket.readyState === WebSocket.OPEN) {
      const payloadStr = JSON.stringify({
        ...msg,
        roomId: this.roomId,
        _senderId: this.senderId,
        _timestamp: Date.now(),
      });
      const pkt = makePublishPacket(this.topic, payloadStr);
      this.cloudSocket.send(pkt as any);
    }
  }

  public close() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);

    if (this.cloudSocket && this.cloudSocket.readyState === WebSocket.OPEN) {
      // Announce departure before leaving
      try {
        const payloadStr = JSON.stringify({
          type: 'room:peer_left',
          roomId: this.roomId,
          payload: { userId: this.currentUser.userId },
          _senderId: this.senderId,
        });
        const pkt = makePublishPacket(this.topic, payloadStr);
        this.cloudSocket.send(pkt as any);
      } catch {}
    }

    try {
      this.primarySocket?.close();
    } catch {}
    try {
      this.cloudSocket?.close();
    } catch {}
  }
}
