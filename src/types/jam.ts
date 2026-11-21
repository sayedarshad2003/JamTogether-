export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  avatarBase64?: string;
  bio: string;
  favoriteGenres: string[];
  status: 'online' | 'in_room' | 'offline';
  currentRoomId?: string;
  currentRoomName?: string;
  cognitoSub?: string;
  isGuest?: boolean;
  authProvider?: 'guest' | 'google' | 'cognito' | 'cognito-local-pool';
  createdAt: number;
}

export interface YouTubeTrack {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSec: number;
  durationFormatted: string;
}

export interface QueueItem {
  itemId: string;
  roomId: string;
  orderIndex: number;
  track: YouTubeTrack;
  addedByUserId: string;
  addedByUsername: string;
  addedByAvatar: string;
  addedAt: number;
  upvotes: string[];
}

export interface PlaybackState {
  roomId: string;
  videoId: string;
  track: YouTubeTrack | null;
  status: 'playing' | 'paused' | 'buffering' | 'ended';
  positionSec: number;
  serverTimestamp: number;
  initiatedByUserId: string;
  initiatedByUsername: string;
  historyIndex: number;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: 'host' | 'member';
  isOnline: boolean;
  inVoiceChat: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
}

export interface ChatReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  messageId: string;
  roomId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  type: 'text' | 'system' | 'track_event';
  timestamp: number;
  reactions: Record<string, string[]>; // emoji -> array of userIds
}

export interface JamRoom {
  roomId: string;
  roomCode: string;
  name: string;
  description: string;
  genreTag: string;
  isPrivate: boolean;
  passcode?: string;
  hostUserId: string;
  hostUsername: string;
  hostAvatarUrl: string;
  createdAt: number;
  activeMemberCount: number;
  playback: PlaybackState;
  members?: RoomMember[];
  queue?: QueueItem[];
  messages?: ChatMessage[];
}

export interface Friendship {
  userId: string;
  friendId: string;
  friendUsername: string;
  friendDisplayName: string;
  friendAvatarUrl: string;
  status: 'accepted' | 'pending_sent' | 'pending_received';
  friendOnlineStatus?: 'online' | 'in_room' | 'offline';
  friendCurrentRoomId?: string;
  friendCurrentRoomName?: string;
  isCloseFriend?: boolean;
  updatedAt: number;
}

export interface RoomInviteNotification {
  inviteId: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  isPrivate?: boolean;
  passcode?: string;
  genreTag?: string;
  senderUserId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderAvatarUrl: string;
  targetUserId: string;
  createdAt: number;
  read?: boolean;
}

export interface ListeningHistoryEntry {
  entryId: string;
  userId: string;
  roomId: string;
  roomName: string;
  track: YouTubeTrack;
  playedAt: number;
}

export interface UserPlaylist {
  playlistId: string;
  userId: string;
  name: string;
  description?: string;
  sourceUrl?: string;
  trackCount: number;
  thumbnailUrl?: string;
  tracks: YouTubeTrack[];
  createdAt: number;
  updatedAt: number;
}

export interface DynamoDBTableSchemaDoc {
  tableName: string;
  partitionKey: string;
  sortKey: string;
  gsi1?: string;
  accessPatterns: string[];
  sampleKey: { PK: string; SK: string };
}

export type WSEventType =
  | 'room:init'
  | 'room:member_joined'
  | 'room:member_left'
  | 'room:members_updated'
  | 'room:host_transferred'
  | 'room:member_kicked'
  | 'room:closed'
  | 'playback:updated'
  | 'playback:sync_check'
  | 'queue:updated'
  | 'chat:new_message'
  | 'chat:reaction_updated'
  | 'webrtc:user_joined_vc'
  | 'webrtc:user_left_vc'
  | 'webrtc:offer'
  | 'webrtc:answer'
  | 'webrtc:ice_candidate'
  | 'webrtc:voice_state'
  | 'presence:update'
  | 'error';

export interface WSMessage<T = any> {
  type: WSEventType;
  roomId?: string;
  payload: T;
  serverTimestamp: number;
}
