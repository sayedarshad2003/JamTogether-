import { ChatMessage } from '../types/jam.ts';

const LOCAL_ROOMS_KEY = 'jam_local_rooms';

export function getRoomStorageKey(roomId: string): string {
  return `jam_messages_${roomId}`;
}

export function loadPersistedRoomMessages(roomId: string): ChatMessage[] {
  if (!roomId) return [];
  try {
    const raw = localStorage.getItem(getRoomStorageKey(roomId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  // Fallback to jam_local_rooms
  try {
    const roomsRaw = localStorage.getItem(LOCAL_ROOMS_KEY);
    if (roomsRaw) {
      const rooms = JSON.parse(roomsRaw);
      if (Array.isArray(rooms)) {
        const r = rooms.find((x: any) => x.roomId === roomId);
        if (r && Array.isArray(r.messages)) return r.messages;
      }
    }
  } catch {}

  return [];
}

export function persistRoomMessages(roomId: string, messages: ChatMessage[]): void {
  if (!roomId || !Array.isArray(messages)) return;
  const trimmed = messages.slice(-150);

  // 1. Dedicated room messages key
  try {
    localStorage.setItem(getRoomStorageKey(roomId), JSON.stringify(trimmed));
  } catch {}

  // 2. Also keep jam_local_rooms synchronized
  try {
    const roomsRaw = localStorage.getItem(LOCAL_ROOMS_KEY);
    if (roomsRaw) {
      const rooms = JSON.parse(roomsRaw);
      if (Array.isArray(rooms)) {
        const r = rooms.find((x: any) => x.roomId === roomId);
        if (r) {
          r.messages = trimmed;
          localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(rooms));
        }
      }
    }
  } catch {}
}

export function mergeChatMessages(
  existing: ChatMessage[] = [],
  incoming: ChatMessage[] = []
): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) {
    if (m && m.messageId) map.set(m.messageId, m);
  }
  for (const m of incoming) {
    if (!m || !m.messageId) continue;
    const current = map.get(m.messageId);
    if (!current) {
      map.set(m.messageId, m);
    } else {
      // Merge emoji reactions
      const mergedReactions: Record<string, string[]> = { ...(current.reactions || {}) };
      if (m.reactions) {
        for (const [emoji, userList] of Object.entries(m.reactions)) {
          const combined = Array.from(
            new Set([...(mergedReactions[emoji] || []), ...(userList || [])])
          );
          mergedReactions[emoji] = combined;
        }
      }
      map.set(m.messageId, {
        ...current,
        ...m,
        reactions: mergedReactions,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}
