import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Crown,
  Users,
  Share2,
  UserMinus,
  Trash2,
  Wifi,
  WifiOff,
  ListMusic,
  MessageSquare,
  Radio,
} from 'lucide-react';
import {
  JamRoom,
  RoomMember,
  QueueItem,
  ChatMessage,
  PlaybackState,
  UserProfile,
  YouTubeTrack,
} from '../types/jam.ts';
import { apiRequest } from '../aws-services/apiClient.ts';
import { RoomRealtimeClient, RealtimeMessage } from '../realtime/roomSync.ts';
import { globalRoomDiscovery } from '../realtime/globalDiscovery.ts';
import { YouTubePlayer } from '../youtube/YouTubePlayer.tsx';
import { YouTubeSearchModal } from '../youtube/YouTubeSearchModal.tsx';
import { useWebRTCVoice } from '../voice-chat/useWebRTCVoice.ts';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.tsx';
import { SharedQueuePanel } from '../playlist/SharedQueuePanel.tsx';
import { LiveChatPanel } from '../chat/LiveChatPanel.tsx';
import {
  loadPersistedRoomMessages,
  persistRoomMessages,
  mergeChatMessages,
} from '../chat/chatStorage.ts';

interface JamRoomViewProps {
  roomId: string;
  currentUser: UserProfile | null;
  onLeaveRoom: () => void;
}

export function JamRoomView({ roomId, currentUser, onLeaveRoom }: JamRoomViewProps) {
  const [room, setRoom] = useState<JamRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [syncMode, setSyncMode] = useState<'backend' | 'cloud-relay' | 'disconnected'>('disconnected');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<'search' | 'playlist' | 'my-playlists'>('search');
  const [toastError, setToastError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'queue' | 'chat' | 'voice' | 'people'>('queue');

  const realtimeClientRef = useRef<RoomRealtimeClient | null>(null);
  const currentPlaybackRef = useRef<PlaybackState | null>(null);
  currentPlaybackRef.current = playback;
  const currentQueueRef = useRef<QueueItem[]>([]);
  currentQueueRef.current = queue;
  const currentMembersRef = useRef<RoomMember[]>([]);
  currentMembersRef.current = members;
  const currentMessagesRef = useRef<ChatMessage[]>([]);
  currentMessagesRef.current = messages;

  const sendWsMessage = useCallback(
    (type: string, payload: any = {}) => {
      if (realtimeClientRef.current) {
        realtimeClientRef.current.send({
          type,
          roomId,
          payload,
        });
      }
    },
    [roomId]
  );

  const {
    inVoiceChat,
    isMuted,
    isSpeaking,
    connectionStatus,
    permissionNotice,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    peerStatuses,
    joinVoiceChat,
    leaveVoiceChat,
    toggleMuteMic,
    triggerTestSpeakingPulse,
    handleSignalingEvent,
  } = useWebRTCVoice({
    roomId,
    currentUser,
    sendWsMessage,
  });

  const handleSignalingRef = useRef(handleSignalingEvent);
  handleSignalingRef.current = handleSignalingEvent;

  const inVoiceChatRef = useRef(inVoiceChat);
  inVoiceChatRef.current = inVoiceChat;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  const currentUserRef = useRef<UserProfile | null>(currentUser);
  currentUserRef.current = currentUser;
  const roomRef = useRef<JamRoom | null>(room);
  roomRef.current = room;
  const membersRef = useRef<RoomMember[]>(members);
  membersRef.current = members;

  // Keep local user's member entry in sync with voice state
  useEffect(() => {
    if (!currentUser) return;
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === currentUser.userId
          ? {
              ...m,
              inVoiceChat,
              isMuted,
              isSpeaking,
            }
          : m
      )
    );
  }, [currentUser, inVoiceChat, isMuted, isSpeaking]);

  // Fetch initial authoritative room state from API
  const fetchRoomState = useCallback(async () => {
    try {
      const res = await apiRequest<{ room: JamRoom }>(`/api/rooms/${roomId}`);
      if (res?.room) {
        setRoom(res.room);
        setMembers(Array.isArray(res.room.members) ? res.room.members : []);
        setQueue(Array.isArray(res.room.queue) ? res.room.queue : []);
        
        // Merge chat messages across local storage, API, and retained cloud broker chat
        const persistedMsgs = loadPersistedRoomMessages(roomId);
        const apiMsgs = Array.isArray(res.room.messages) ? res.room.messages : [];
        const cloudMsgs = globalRoomDiscovery.getRoomChat(roomId);
        const initialMerged = mergeChatMessages(
          mergeChatMessages(persistedMsgs, apiMsgs),
          cloudMsgs
        );
        setMessages(initialMerged);
        persistRoomMessages(roomId, initialMerged);
        globalRoomDiscovery.broadcastRoomChat(roomId, initialMerged);

        if (res.room.playback) setPlayback(res.room.playback);
        globalRoomDiscovery.broadcastRoom(res.room);
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoomState();
  }, [fetchRoomState]);

  // Keep chat messages in sync with cloud MQTT retained chat history
  useEffect(() => {
    const unsubscribe = globalRoomDiscovery.subscribeRoomChat(roomId, (cloudMsgs) => {
      if (Array.isArray(cloudMsgs) && cloudMsgs.length > 0) {
        setMessages((prev) => {
          const merged = mergeChatMessages(prev, cloudMsgs);
          persistRoomMessages(roomId, merged);
          return merged;
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [roomId]);

  // Connect to Real-Time Room Sync Layer (Direct WS locally, MQTT WebSocket Cloud Relay on Amplify)
  useEffect(() => {
    if (!currentUser) return;
    const activeUser = currentUser;
    let isUnmounted = false;

    const client = new RoomRealtimeClient(
      roomId,
      activeUser,
      (msg: RealtimeMessage) => {
        if (isUnmounted) return;
        if (msg.roomId && msg.roomId !== roomId) return;

        switch (msg.type) {
          case 'room:init': {
            const r = msg.payload?.room as JamRoom;
            if (r) {
              setRoom(r);
              setMembers(Array.isArray(r.members) ? r.members : []);
              setQueue(Array.isArray(r.queue) ? r.queue : []);
              if (r.playback) setPlayback(r.playback);
              if (Array.isArray(r.messages) && r.messages.length > 0) {
                setMessages((prev) => {
                  const merged = mergeChatMessages(prev, r.messages!);
                  persistRoomMessages(roomId, merged);
                  return merged;
                });
              }
            }
            break;
          }
          case 'room:peer_joined': {
            const joiningMember = msg.payload?.member as RoomMember;
            if (joiningMember && joiningMember.userId !== activeUser.userId) {
              setMembers((prev) => {
                const exists = prev.some((m) => m.userId === joiningMember.userId);
                const nextMembers = exists ? prev : [...prev, joiningMember];
                // Broadcast current room state AND full chat messages history back to joining peer
                realtimeClientRef.current?.send({
                  type: 'room:sync_state',
                  payload: {
                    members: nextMembers,
                    playback: currentPlaybackRef.current,
                    queue: currentQueueRef.current,
                    messages: currentMessagesRef.current,
                  },
                });
                return nextMembers;
              });
            }
            break;
          }
          case 'room:sync_state': {
            const {
              members: incomingMembers,
              playback: incomingPlayback,
              queue: incomingQueue,
              messages: incomingMessages,
            } = msg.payload || {};
            if (Array.isArray(incomingMembers) && incomingMembers.length > 0) {
              setMembers((prev) => {
                const map = new Map<string, RoomMember>();
                prev.forEach((m) => map.set(m.userId, m));
                incomingMembers.forEach((m) => map.set(m.userId, m));
                return Array.from(map.values());
              });
            }
            if (incomingPlayback) {
              setPlayback(incomingPlayback);
            }
            if (Array.isArray(incomingQueue)) {
              setQueue(incomingQueue);
            }
            if (Array.isArray(incomingMessages) && incomingMessages.length > 0) {
              setMessages((prev) => {
                const merged = mergeChatMessages(prev, incomingMessages);
                persistRoomMessages(roomId, merged);
                globalRoomDiscovery.broadcastRoomChat(roomId, merged);
                return merged;
              });
            }
            break;
          }
          case 'room:peer_left': {
            const leftUserId = msg.payload?.userId;
            if (!leftUserId) break;

            const currentRoom = roomRef.current;
            setMembers((prev) => {
              const remaining = prev.filter((m) => m.userId !== leftUserId);

              // Instant Host Migration: If the leaving user was the room host, elect next available member immediately
              if (currentRoom && currentRoom.hostUserId === leftUserId && remaining.length > 0) {
                const nextHost = remaining[0];
                const updatedRoom: JamRoom = {
                  ...currentRoom,
                  hostUserId: nextHost.userId,
                  hostUsername: nextHost.displayName || nextHost.username,
                  hostAvatarUrl: nextHost.avatarUrl,
                };
                setRoom(updatedRoom);

                // If this client is the newly elected host, persist and announce to all peers immediately
                if (activeUser.userId === nextHost.userId) {
                  globalRoomDiscovery.broadcastRoom(updatedRoom);
                  realtimeClientRef.current?.send({
                    type: 'room:host_transferred',
                    payload: {
                      hostUserId: nextHost.userId,
                      hostUsername: nextHost.displayName || nextHost.username,
                      hostAvatarUrl: nextHost.avatarUrl,
                      room: updatedRoom,
                    },
                  });
                  apiRequest(`/api/rooms/${roomId}/transfer-host`, {
                    method: 'POST',
                    body: JSON.stringify({
                      newHostUserId: nextHost.userId,
                      newHostUsername: nextHost.displayName || nextHost.username,
                      newHostAvatarUrl: nextHost.avatarUrl,
                    }),
                  }).catch(() => {});
                }

                return remaining.map((m) => ({
                  ...m,
                  role: m.userId === nextHost.userId ? 'host' : 'member',
                }));
              }

              return remaining;
            });
            break;
          }
          case 'room:member_updated': {
            const updatedMember = msg.payload?.member as Partial<RoomMember>;
            if (updatedMember && updatedMember.userId) {
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === updatedMember.userId
                    ? { ...m, ...updatedMember }
                    : m
                )
              );
              setRoom((prev) => {
                if (!prev || prev.hostUserId !== updatedMember.userId) return prev;
                return {
                  ...prev,
                  hostUsername: updatedMember.displayName || updatedMember.username || prev.hostUsername,
                  hostAvatarUrl: updatedMember.avatarUrl || prev.hostAvatarUrl,
                };
              });
            }
            break;
          }
          case 'room:presence_ping': {
            const peer = msg.payload?.member as RoomMember;
            if (peer && peer.userId !== activeUser.userId) {
              setMembers((prev) => {
                const exists = prev.some((m) => m.userId === peer.userId);
                if (!exists) return [...prev, peer];
                return prev.map((m) =>
                  m.userId === peer.userId
                    ? {
                        ...m,
                        ...peer,
                        isOnline: true,
                        inVoiceChat:
                          typeof peer.inVoiceChat === 'boolean'
                            ? peer.inVoiceChat
                            : m.inVoiceChat,
                      }
                    : m
                );
              });

              // Keep host avatar & username in sync if peer is the current host
              if (roomRef.current && peer.userId === roomRef.current.hostUserId && peer.avatarUrl) {
                setRoom((prev) =>
                  prev
                    ? {
                        ...prev,
                        hostAvatarUrl: peer.avatarUrl || prev.hostAvatarUrl,
                        hostUsername: peer.displayName || peer.username || prev.hostUsername,
                      }
                    : prev
                );
              }
            }
            break;
          }
          case 'room:members_updated': {
            if (Array.isArray(msg.payload?.members)) {
              setMembers(msg.payload.members);
            }
            break;
          }
          case 'room:host_transferred': {
            const { hostUserId, hostUsername, hostAvatarUrl, members: updatedMembers, room: updatedRoom } =
              msg.payload || {};
            setRoom((prev) => {
              if (updatedRoom) return updatedRoom;
              if (!prev) return prev;
              const newHostMember = (updatedMembers || prev.members || []).find(
                (m: RoomMember) => m.userId === hostUserId
              );
              return {
                ...prev,
                hostUserId: hostUserId || prev.hostUserId,
                hostUsername:
                  hostUsername || newHostMember?.displayName || newHostMember?.username || prev.hostUsername,
                hostAvatarUrl: hostAvatarUrl || newHostMember?.avatarUrl || prev.hostAvatarUrl,
              };
            });
            if (Array.isArray(updatedMembers)) {
              setMembers(updatedMembers);
            } else if (hostUserId) {
              setMembers((prev) =>
                prev.map((m) => ({
                  ...m,
                  role: m.userId === hostUserId ? 'host' : 'member',
                }))
              );
            }
            break;
          }
          case 'room:member_kicked': {
            const { targetUserId, members: updatedMembers } = msg.payload || {};
            if (targetUserId === activeUser.userId) {
              onLeaveRoom();
              return;
            }
            const currentRoom = roomRef.current;
            if (Array.isArray(updatedMembers)) {
              setMembers(updatedMembers);
            } else if (targetUserId) {
              setMembers((prev) => {
                const remaining = prev.filter((m) => m.userId !== targetUserId);
                // If kicked user was host, switch host instantly
                if (currentRoom && currentRoom.hostUserId === targetUserId && remaining.length > 0) {
                  const nextHost = remaining[0];
                  const updatedRoom: JamRoom = {
                    ...currentRoom,
                    hostUserId: nextHost.userId,
                    hostUsername: nextHost.displayName || nextHost.username,
                    hostAvatarUrl: nextHost.avatarUrl,
                  };
                  setRoom(updatedRoom);
                  if (activeUser.userId === nextHost.userId) {
                    globalRoomDiscovery.broadcastRoom(updatedRoom);
                    realtimeClientRef.current?.send({
                      type: 'room:host_transferred',
                      payload: {
                        hostUserId: nextHost.userId,
                        hostUsername: nextHost.displayName || nextHost.username,
                        hostAvatarUrl: nextHost.avatarUrl,
                        room: updatedRoom,
                      },
                    });
                  }
                  return remaining.map((m) => ({
                    ...m,
                    role: m.userId === nextHost.userId ? 'host' : 'member',
                  }));
                }
                return remaining;
              });
            }
            break;
          }
          case 'room:closed': {
            onLeaveRoom();
            break;
          }
          case 'playback:updated':
          case 'playback:sync_check': {
            if (msg.payload?.playback) {
              setPlayback(msg.payload.playback);
            }
            break;
          }
          case 'queue:updated': {
            if (Array.isArray(msg.payload?.queue)) {
              setQueue(msg.payload.queue);
            }
            break;
          }
          case 'chat:new_message': {
            const incoming = msg.payload?.message as ChatMessage;
            if (incoming && incoming.messageId) {
              setMessages((prev) => {
                const merged = mergeChatMessages(prev, [incoming]);
                persistRoomMessages(roomId, merged);
                globalRoomDiscovery.broadcastRoomChat(roomId, merged);
                return merged;
              });
            }
            break;
          }
          case 'chat:reaction_updated': {
            const { messageId, reactions } = msg.payload || {};
            if (messageId) {
              setMessages((prev) => {
                const merged = prev.map((m) =>
                  m.messageId === messageId ? { ...m, reactions } : m
                );
                persistRoomMessages(roomId, merged);
                globalRoomDiscovery.broadcastRoomChat(roomId, merged);
                return merged;
              });
            }
            break;
          }
          case 'webrtc:join_vc':
          case 'webrtc:user_joined_vc': {
            const { userId, fromUserId } = msg.payload || {};
            const joiningId = userId || fromUserId;
            if (joiningId) {
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === joiningId ? { ...m, inVoiceChat: true } : m
                )
              );
            }
            if (Array.isArray(msg.payload?.members)) {
              setMembers(msg.payload.members);
            }
            handleSignalingRef.current('webrtc:user_joined_vc', msg.payload);
            break;
          }
          case 'webrtc:leave_vc':
          case 'webrtc:user_left_vc': {
            const { userId, fromUserId } = msg.payload || {};
            const leavingId = userId || fromUserId;
            if (leavingId) {
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === leavingId ? { ...m, inVoiceChat: false, isSpeaking: false } : m
                )
              );
            }
            if (Array.isArray(msg.payload?.members)) {
              setMembers(msg.payload.members);
            }
            handleSignalingRef.current('webrtc:user_left_vc', msg.payload);
            break;
          }
          case 'webrtc:offer': {
            const { fromUserId } = msg.payload || {};
            if (fromUserId) {
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === fromUserId ? { ...m, inVoiceChat: true } : m
                )
              );
            }
            handleSignalingRef.current(msg.type, msg.payload);
            break;
          }
          case 'webrtc:answer': {
            const { fromUserId } = msg.payload || {};
            if (fromUserId) {
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === fromUserId ? { ...m, inVoiceChat: true } : m
                )
              );
            }
            handleSignalingRef.current(msg.type, msg.payload);
            break;
          }
          case 'webrtc:ice_candidate': {
            handleSignalingRef.current(msg.type, msg.payload);
            break;
          }
          case 'webrtc:voice_state': {
            const { userId, fromUserId, isMuted: peerMuted, isSpeaking: peerSpeaking, inVoiceChat: peerInVc } =
              msg.payload || {};
            const targetId = userId || fromUserId;
            if (targetId) {
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === targetId
                    ? {
                        ...m,
                        inVoiceChat: typeof peerInVc === 'boolean' ? peerInVc : true,
                        isMuted: typeof peerMuted === 'boolean' ? peerMuted : m.isMuted,
                        isSpeaking:
                          typeof peerSpeaking === 'boolean' ? peerSpeaking : m.isSpeaking,
                      }
                    : m
                )
              );
            }
            break;
          }
        }
      },
      (connected: boolean, mode) => {
        if (!isUnmounted) {
          setWsConnected(connected);
          setSyncMode(mode);
        }
      }
    );

    realtimeClientRef.current = client;

    // Presence heartbeat: keeps presence list in sync across all clients every 12 seconds
    const presenceTimer = window.setInterval(() => {
      if (isUnmounted) return;
      const current = currentUserRef.current || activeUser;
      const currentRoom = roomRef.current;
      const isCurrentHost = Boolean(currentRoom && currentRoom.hostUserId === current.userId);
      client.send({
        type: 'room:presence_ping',
        payload: {
          member: {
            roomId,
            userId: current.userId,
            username: current.username,
            displayName: current.displayName,
            avatarUrl: current.avatarUrl,
            role: isCurrentHost ? 'host' : 'member',
            isOnline: true,
            inVoiceChat: inVoiceChatRef.current,
            isMuted: isMutedRef.current,
            isSpeaking: isSpeakingRef.current,
            joinedAt: Date.now(),
          },
        },
      });
    }, 12000);

    return () => {
      isUnmounted = true;
      clearInterval(presenceTimer);
      client.close();
      realtimeClientRef.current = null;
    };
  }, [roomId, currentUser?.userId, onLeaveRoom]);

  // Keep local and remote participant state in sync when user updates avatar or display name
  useEffect(() => {
    if (!currentUser) return;
    realtimeClientRef.current?.updateUser(currentUser);

    setMembers((prev) =>
      prev.map((m) =>
        m.userId === currentUser.userId
          ? {
              ...m,
              displayName: currentUser.displayName,
              avatarUrl: currentUser.avatarUrl,
            }
          : m
      )
    );

    setRoom((prev) => {
      if (!prev || prev.hostUserId !== currentUser.userId) return prev;
      const updated = {
        ...prev,
        hostUsername: currentUser.displayName || currentUser.username,
        hostAvatarUrl: currentUser.avatarUrl,
      };
      globalRoomDiscovery.broadcastRoom(updated);
      return updated;
    });
  }, [currentUser?.avatarUrl, currentUser?.displayName]);

  const isHost = Boolean(room && currentUser && room.hostUserId === currentUser.userId);

  const handlePlaybackAction = useCallback(
    async (
      action: 'play' | 'pause' | 'seek' | 'next' | 'previous',
      positionSec?: number,
      allowMemberAutoAdvance?: boolean
    ) => {
      try {
        const res = await apiRequest<{ playback: PlaybackState }>(
          `/api/rooms/${roomId}/playback`,
          {
            method: 'POST',
            body: JSON.stringify({ action, positionSec, allowMemberAutoAdvance }),
          }
        );
        if (res?.playback) {
          setPlayback(res.playback);
          realtimeClientRef.current?.send({
            type: 'playback:updated',
            payload: { playback: res.playback },
          });
        }
      } catch (err) {
        setToastError((err as Error).message);
        setTimeout(() => setToastError(null), 3500);
      }
    },
    [roomId]
  );

  const handleSelectTrackFromQueue = async (track: YouTubeTrack) => {
    try {
      const res = await apiRequest<{ playback: PlaybackState }>(
        `/api/rooms/${roomId}/playback`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'selectTrack', track }),
        }
      );
      if (res?.playback) {
        setPlayback(res.playback);
        realtimeClientRef.current?.send({
          type: 'playback:updated',
          payload: { playback: res.playback },
        });
      }
    } catch (err) {
      setToastError((err as Error).message);
      setTimeout(() => setToastError(null), 3500);
    }
  };

  const handleAddTrackToQueue = async (track: YouTubeTrack) => {
    try {
      const res = await apiRequest<{ queue: QueueItem[]; playback?: PlaybackState }>(`/api/rooms/${roomId}/queue`, {
        method: 'POST',
        body: JSON.stringify({ track }),
      });
      if (Array.isArray(res?.queue)) {
        setQueue(res.queue);
        realtimeClientRef.current?.send({
          type: 'queue:updated',
          payload: { queue: res.queue },
        });
      }
      if (res?.playback) {
        setPlayback(res.playback);
        realtimeClientRef.current?.send({
          type: 'playback:updated',
          payload: { playback: res.playback },
        });
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleAddPlaylistToQueue = async (
    playlistUrl: string,
    tracks?: YouTubeTrack[],
    playlistName?: string
  ) => {
    try {
      const res = await apiRequest<{
        queue: QueueItem[];
        playback?: PlaybackState;
        addedCount: number;
        playlistTitle: string;
      }>(`/api/rooms/${roomId}/queue/playlist`, {
        method: 'POST',
        body: JSON.stringify({ playlistUrl, tracks, playlistName, saveToMyPlaylists: true }),
      });
      if (Array.isArray(res?.queue)) {
        setQueue(res.queue);
        realtimeClientRef.current?.send({
          type: 'queue:updated',
          payload: { queue: res.queue },
        });
      }
      if (res?.playback) {
        setPlayback(res.playback);
        realtimeClientRef.current?.send({
          type: 'playback:updated',
          payload: { playback: res.playback },
        });
      }
      setToastError(null);
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleQueueUserPlaylist = async (playlistId: string) => {
    try {
      const res = await apiRequest<{
        queue: QueueItem[];
        playback?: PlaybackState;
        addedCount: number;
        playlistName: string;
      }>(`/api/rooms/${roomId}/queue/user-playlist/${playlistId}`, {
        method: 'POST',
      });
      if (Array.isArray(res?.queue)) {
        setQueue(res.queue);
        realtimeClientRef.current?.send({
          type: 'queue:updated',
          payload: { queue: res.queue },
        });
      }
      if (res?.playback) {
        setPlayback(res.playback);
        realtimeClientRef.current?.send({
          type: 'playback:updated',
          payload: { playback: res.playback },
        });
      }
      setToastError(null);
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleRemoveQueueItem = async (itemId: string) => {
    try {
      const res = await apiRequest<{ queue: QueueItem[] }>(
        `/api/rooms/${roomId}/queue/${itemId}`,
        { method: 'DELETE' }
      );
      if (Array.isArray(res?.queue)) {
        setQueue(res.queue);
        realtimeClientRef.current?.send({
          type: 'queue:updated',
          payload: { queue: res.queue },
        });
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleReorderQueueItem = async (itemId: string, direction: 'up' | 'down') => {
    try {
      const res = await apiRequest<{ queue: QueueItem[] }>(
        `/api/rooms/${roomId}/queue/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ itemId, direction }),
        }
      );
      if (Array.isArray(res?.queue)) {
        setQueue(res.queue);
        realtimeClientRef.current?.send({
          type: 'queue:updated',
          payload: { queue: res.queue },
        });
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      const res = await apiRequest<{ message: ChatMessage }>(
        `/api/rooms/${roomId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        }
      );
      if (res?.message?.messageId) {
        setMessages((prev) => {
          const merged = mergeChatMessages(prev, [res.message]);
          persistRoomMessages(roomId, merged);
          globalRoomDiscovery.broadcastRoomChat(roomId, merged);
          return merged;
        });
        realtimeClientRef.current?.send({
          type: 'chat:new_message',
          payload: { message: res.message },
        });
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      const res = await apiRequest<{ message: ChatMessage }>(
        `/api/rooms/${roomId}/messages/${messageId}/react`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        }
      );
      if (res?.message?.messageId) {
        setMessages((prev) => {
          const merged = prev.map((m) => (m.messageId === messageId ? res.message : m));
          persistRoomMessages(roomId, merged);
          globalRoomDiscovery.broadcastRoomChat(roomId, merged);
          return merged;
        });
        realtimeClientRef.current?.send({
          type: 'chat:reaction_updated',
          payload: { messageId, reactions: res.message.reactions },
        });
      }
    } catch {
      // ignore
    }
  };

  const handleTransferHost = async (newHostUserId: string) => {
    try {
      const res = await apiRequest<{ room: JamRoom }>(`/api/rooms/${roomId}/transfer-host`, {
        method: 'POST',
        body: JSON.stringify({ newHostUserId }),
      });
      if (res.room) {
        setRoom(res.room);
        setMembers(res.room.members || []);
        realtimeClientRef.current?.send({
          type: 'room:host_transferred',
          payload: {
            hostUserId: res.room.hostUserId,
            hostUsername: res.room.hostUsername,
            hostAvatarUrl: res.room.hostAvatarUrl,
            room: res.room,
            members: res.room.members,
          },
        });
        globalRoomDiscovery.broadcastRoom(res.room);
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleKickMember = async (targetUserId: string) => {
    try {
      const res = await apiRequest<{ members: RoomMember[]; room?: JamRoom }>(
        `/api/rooms/${roomId}/remove-member`,
        {
          method: 'POST',
          body: JSON.stringify({ targetUserId }),
        }
      );
      if (Array.isArray(res?.members)) {
        setMembers(res.members);
        if (res.room) {
          setRoom(res.room);
          globalRoomDiscovery.broadcastRoom(res.room);
        }
        realtimeClientRef.current?.send({
          type: 'room:member_kicked',
          payload: { targetUserId, members: res.members, room: res.room },
        });
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleCloseRoom = async () => {
    try {
      realtimeClientRef.current?.send({ type: 'room:closed' });
      globalRoomDiscovery.unbroadcastRoom(roomId, room?.roomCode);
      await apiRequest(`/api/rooms/${roomId}`, { method: 'DELETE' });
      onLeaveRoom();
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleLeave = async () => {
    if (inVoiceChat) {
      leaveVoiceChat();
    }

    // Instant Host Migration: If current user is host and other members are present, switch host before leaving
    if (isHost && members.length > 1) {
      const nextHost = members.find((m) => m.userId !== currentUser?.userId);
      if (nextHost && room) {
        const updatedRoom: JamRoom = {
          ...room,
          hostUserId: nextHost.userId,
          hostUsername: nextHost.displayName || nextHost.username,
          hostAvatarUrl: nextHost.avatarUrl,
        };
        try {
          realtimeClientRef.current?.send({
            type: 'room:host_transferred',
            payload: {
              hostUserId: nextHost.userId,
              hostUsername: nextHost.displayName || nextHost.username,
              hostAvatarUrl: nextHost.avatarUrl,
              room: updatedRoom,
            },
          });
          globalRoomDiscovery.broadcastRoom(updatedRoom);
          await apiRequest(`/api/rooms/${roomId}/transfer-host`, {
            method: 'POST',
            body: JSON.stringify({
              newHostUserId: nextHost.userId,
              newHostUsername: nextHost.displayName || nextHost.username,
              newHostAvatarUrl: nextHost.avatarUrl,
            }),
          });
        } catch {}
      }
    }

    try {
      await apiRequest(`/api/rooms/${roomId}/leave`, { method: 'POST' });
    } catch {
      // ignore
    }
    onLeaveRoom();
  };

  const copyRoomCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyInviteLink = () => {
    if (!room) return;
    const shareUrl = `${window.location.origin}/?room=${room.roomId}`;
    navigator.clipboard?.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!room || !playback) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-[#11131C] animate-pulse border border-slate-200 dark:border-slate-800" />
      </div>
    );
  }

  // Helper to render participants panel
  const renderParticipants = () => (
    <div className="rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Participants ({members.length})
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Host:</span>
          <img
            src={room.hostAvatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(room.hostUsername || 'Host')}`}
            alt={room.hostUsername}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(room.hostUsername || 'Host')}`;
            }}
            className="w-4 h-4 rounded-full object-cover border border-violet-500/40"
          />
          <strong className="text-slate-900 dark:text-white">{room.hostUsername}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {members.map((member) => {
          const isMemberHost = member.userId === room.hostUserId;
          return (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/80 dark:border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={member.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(member.displayName || member.username || 'user')}`}
                  alt={member.displayName}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(member.displayName || member.username || 'user')}`;
                  }}
                  className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {member.displayName}
                    </span>
                    {isMemberHost && (
                      <Crown
                        className="w-3.5 h-3.5 text-amber-500 shrink-0"
                        aria-label="Room Host"
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    @{member.username} · {member.isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>

              {isHost && !isMemberHost && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTransferHost(member.userId)}
                    className="px-2 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                    title="Transfer Host privileges to this member"
                  >
                    Make Host
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKickMember(member.userId)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Remove member from room"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {toastError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{toastError}</span>
          <button onClick={() => setToastError(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Streamlined Room Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleLeave}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-[#181B28] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Leave Jam Room"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                {room.name}
              </h1>
              <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
                · {room.genreTag}
              </span>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-xs">
                <img
                  src={room.hostAvatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(room.hostUsername || 'Host')}`}
                  alt={room.hostUsername}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(room.hostUsername || 'Host')}`;
                  }}
                  className="w-3.5 h-3.5 rounded-full object-cover"
                />
                <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">
                  {room.hostUsername}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Actions: Share & Room Code */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {/* Room Code Badge */}
          <button
            type="button"
            onClick={copyRoomCode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181B28] hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 transition-colors"
            title="Click to copy room code"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-violet-500" />
                <span>#{room.roomCode}</span>
              </>
            )}
          </button>

          {/* 1-Tap Share / Invite */}
          <button
            type="button"
            onClick={copyInviteLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-xs font-semibold text-violet-600 dark:text-violet-300 transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </>
            )}
          </button>

          {isHost && (
            <button
              type="button"
              onClick={handleCloseRoom}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-600 dark:text-red-400 transition-colors"
              title="Close Room for Everyone"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline sm:ml-1">End</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Responsive Jam Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left Column (Desktop 7 cols) / Primary Column (Mobile) */}
        <div className="lg:col-span-7 space-y-4">
          <YouTubePlayer
            playback={playback}
            isHost={isHost}
            onPlaybackAction={handlePlaybackAction}
            onRequestSyncCheck={() => sendWsMessage('playback:request_sync')}
            onOpenSearch={() => {
              setSearchTab('search');
              setSearchOpen(true);
            }}
          />

          {/* MOBILE ONLY: Sleek Segmented Navigation Tabs */}
          <div className="lg:hidden space-y-3">
            <div className="grid grid-cols-4 p-1 rounded-xl bg-slate-100 dark:bg-[#131520] border border-slate-200 dark:border-slate-800 gap-1">
              <button
                type="button"
                onClick={() => setMobileTab('queue')}
                className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  mobileTab === 'queue'
                    ? 'bg-white dark:bg-[#1E2235] text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Queue</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  {queue.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  mobileTab === 'chat'
                    ? 'bg-white dark:bg-[#1E2235] text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
                {messages.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {messages.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('voice')}
                className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  mobileTab === 'voice'
                    ? 'bg-white dark:bg-[#1E2235] text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Voice</span>
                {inVoiceChat && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('people')}
                className={`py-2 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  mobileTab === 'people'
                    ? 'bg-white dark:bg-[#1E2235] text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>People</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {members.length}
                </span>
              </button>
            </div>

            {/* Mobile Tab Panes */}
            {mobileTab === 'queue' && (
              <div className="h-[460px]">
                <SharedQueuePanel
                  queue={queue}
                  currentVideoId={playback.videoId}
                  currentUserId={currentUser?.userId}
                  isHost={isHost}
                  onSelectTrack={handleSelectTrackFromQueue}
                  onRemoveItem={handleRemoveQueueItem}
                  onReorderItem={handleReorderQueueItem}
                  onOpenSearch={(tab = 'search') => {
                    setSearchTab(tab);
                    setSearchOpen(true);
                  }}
                />
              </div>
            )}

            {mobileTab === 'chat' && (
              <div className="h-[460px]">
                <LiveChatPanel
                  messages={messages}
                  members={members}
                  currentUser={currentUser}
                  onSendMessage={handleSendMessage}
                  onToggleReaction={handleToggleReaction}
                />
              </div>
            )}

            {mobileTab === 'voice' && (
              <VoiceChatPanel
                members={members}
                currentUser={currentUser}
                inVoiceChat={inVoiceChat}
                isMuted={isMuted}
                isSpeaking={isSpeaking}
                connectionStatus={connectionStatus}
                permissionNotice={permissionNotice}
                audioDevices={audioDevices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                peerStatuses={peerStatuses}
                onJoinVC={joinVoiceChat}
                onLeaveVC={leaveVoiceChat}
                onToggleMute={toggleMuteMic}
                onTestSpeakingPulse={triggerTestSpeakingPulse}
              />
            )}

            {mobileTab === 'people' && renderParticipants()}
          </div>

          {/* DESKTOP ONLY: VoiceChatPanel + Room Participants in Left Column */}
          <div className="hidden lg:block space-y-6">
            <VoiceChatPanel
              members={members}
              currentUser={currentUser}
              inVoiceChat={inVoiceChat}
              isMuted={isMuted}
              isSpeaking={isSpeaking}
              connectionStatus={connectionStatus}
              permissionNotice={permissionNotice}
              audioDevices={audioDevices}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
              peerStatuses={peerStatuses}
              onJoinVC={joinVoiceChat}
              onLeaveVC={leaveVoiceChat}
              onToggleMute={toggleMuteMic}
              onTestSpeakingPulse={triggerTestSpeakingPulse}
            />

            {renderParticipants()}
          </div>
        </div>

        {/* Right 5 Columns: DESKTOP ONLY (Queue + Chat) */}
        <div className="hidden lg:block lg:col-span-5 space-y-6">
          <div className="h-[370px]">
            <SharedQueuePanel
              queue={queue}
              currentVideoId={playback.videoId}
              currentUserId={currentUser?.userId}
              isHost={isHost}
              onSelectTrack={handleSelectTrackFromQueue}
              onRemoveItem={handleRemoveQueueItem}
              onReorderItem={handleReorderQueueItem}
              onOpenSearch={(tab = 'search') => {
                setSearchTab(tab);
                setSearchOpen(true);
              }}
            />
          </div>

          <div className="h-[460px]">
            <LiveChatPanel
              messages={messages}
              members={members}
              currentUser={currentUser}
              onSendMessage={handleSendMessage}
              onToggleReaction={handleToggleReaction}
            />
          </div>
        </div>
      </div>

      <YouTubeSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        isHost={isHost}
        initialTab={searchTab}
        onAddTrack={handleAddTrackToQueue}
        onPlayNow={handleSelectTrackFromQueue}
        onAddPlaylist={handleAddPlaylistToQueue}
        onQueueUserPlaylist={handleQueueUserPlaylist}
      />
    </div>
  );
}
