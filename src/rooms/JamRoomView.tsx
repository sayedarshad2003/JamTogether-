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
import { YouTubePlayer } from '../youtube/YouTubePlayer.tsx';
import { YouTubeSearchModal } from '../youtube/YouTubeSearchModal.tsx';
import { useWebRTCVoice } from '../voice-chat/useWebRTCVoice.ts';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.tsx';
import { SharedQueuePanel } from '../playlist/SharedQueuePanel.tsx';
import { LiveChatPanel } from '../chat/LiveChatPanel.tsx';

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
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<'search' | 'playlist' | 'my-playlists'>('search');
  const [toastError, setToastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const sendWsMessage = useCallback(
    (type: string, payload: any = {}) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type,
            roomId,
            payload,
          })
        );
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

  // Fetch initial authoritative room state from API
  const fetchRoomState = useCallback(async () => {
    try {
      const res = await apiRequest<{ room: JamRoom }>(`/api/rooms/${roomId}`);
      setRoom(res.room);
      setMembers(res.room.members || []);
      setQueue(res.room.queue || []);
      setMessages(res.room.messages || []);
      setPlayback(res.room.playback);
    } catch (err) {
      setToastError((err as Error).message);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoomState();
  }, [fetchRoomState]);

  // Connect to Real-Time WebSocket Server with automatic reconnection & state recovery
  useEffect(() => {
    if (!currentUser) return;
    const activeUser = currentUser;
    let isUnmounted = false;

    function connectWs() {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isUnmounted) return;
        setWsConnected(true);
        socket.send(
          JSON.stringify({
            type: 'room:subscribe',
            roomId,
            payload: {
              userId: activeUser.userId,
              username: activeUser.username,
              displayName: activeUser.displayName,
              avatarUrl: activeUser.avatarUrl,
            },
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.roomId && msg.roomId !== roomId) return;

          switch (msg.type) {
            case 'room:init': {
              const r = msg.payload?.room as JamRoom;
              if (r) {
                setRoom(r);
                setMembers(r.members || []);
                setQueue(r.queue || []);
                setMessages(r.messages || []);
                setPlayback(r.playback);
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
              const { hostUserId, hostUsername, members: updatedMembers } = msg.payload || {};
              setRoom((prev) =>
                prev ? { ...prev, hostUserId, hostUsername } : prev
              );
              if (Array.isArray(updatedMembers)) {
                setMembers(updatedMembers);
              }
              break;
            }
            case 'room:member_kicked': {
              const { targetUserId, members: updatedMembers } = msg.payload || {};
              if (targetUserId === activeUser.userId) {
                onLeaveRoom();
                return;
              }
              if (Array.isArray(updatedMembers)) {
                setMembers(updatedMembers);
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
              if (incoming) {
                // Idempotent check to prevent duplicates
                setMessages((prev) =>
                  prev.some((m) => m.messageId === incoming.messageId)
                    ? prev
                    : [...prev, incoming]
                );
              }
              break;
            }
            case 'chat:reaction_updated': {
              const { messageId, reactions } = msg.payload || {};
              setMessages((prev) =>
                prev.map((m) => (m.messageId === messageId ? { ...m, reactions } : m))
              );
              break;
            }
            case 'webrtc:user_joined_vc':
            case 'webrtc:user_left_vc': {
              if (Array.isArray(msg.payload?.members)) {
                setMembers(msg.payload.members);
              }
              handleSignalingRef.current(msg.type, msg.payload);
              break;
            }
            case 'webrtc:offer':
            case 'webrtc:answer':
            case 'webrtc:ice_candidate': {
              handleSignalingRef.current(msg.type, msg.payload);
              break;
            }
            case 'webrtc:voice_state': {
              const { userId, isMuted: peerMuted, isSpeaking: peerSpeaking } = msg.payload || {};
              setMembers((prev) =>
                prev.map((m) =>
                  m.userId === userId
                    ? {
                        ...m,
                        inVoiceChat: true,
                        isMuted: typeof peerMuted === 'boolean' ? peerMuted : m.isMuted,
                        isSpeaking:
                          typeof peerSpeaking === 'boolean' ? peerSpeaking : m.isSpeaking,
                      }
                    : m
                )
              );
              break;
            }
          }
        } catch {
          // ignore malformed packet
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        if (!isUnmounted) {
          reconnectTimerRef.current = window.setTimeout(() => {
            connectWs();
          }, 2500);
        }
      };
    }

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomId, currentUser, onLeaveRoom]);

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
        setPlayback(res.playback);
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
      setPlayback(res.playback);
    } catch (err) {
      setToastError((err as Error).message);
      setTimeout(() => setToastError(null), 3500);
    }
  };

  const handleAddTrackToQueue = async (track: YouTubeTrack) => {
    try {
      const res = await apiRequest<{ queue: QueueItem[] }>(`/api/rooms/${roomId}/queue`, {
        method: 'POST',
        body: JSON.stringify({ track }),
      });
      setQueue(res.queue);
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
        addedCount: number;
        playlistTitle: string;
      }>(`/api/rooms/${roomId}/queue/playlist`, {
        method: 'POST',
        body: JSON.stringify({ playlistUrl, tracks, playlistName, saveToMyPlaylists: true }),
      });
      setQueue(res.queue);
      setToastError(null);
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleQueueUserPlaylist = async (playlistId: string) => {
    try {
      const res = await apiRequest<{
        queue: QueueItem[];
        addedCount: number;
        playlistName: string;
      }>(`/api/rooms/${roomId}/queue/user-playlist/${playlistId}`, {
        method: 'POST',
      });
      setQueue(res.queue);
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
      setQueue(res.queue);
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
      setQueue(res.queue);
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
      setMessages((prev) =>
        prev.some((m) => m.messageId === res.message.messageId)
          ? prev
          : [...prev, res.message]
      );
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
      setMessages((prev) =>
        prev.map((m) => (m.messageId === messageId ? res.message : m))
      );
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
      }
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleKickMember = async (targetUserId: string) => {
    try {
      const res = await apiRequest<{ members: RoomMember[] }>(
        `/api/rooms/${roomId}/remove-member`,
        {
          method: 'POST',
          body: JSON.stringify({ targetUserId }),
        }
      );
      setMembers(res.members);
    } catch (err) {
      setToastError((err as Error).message);
    }
  };

  const handleCloseRoom = async () => {
    try {
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

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {toastError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{toastError}</span>
          <button onClick={() => setToastError(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Room Context Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800">
        <div className="flex items-start sm:items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={handleLeave}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#181B28] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Leave Jam Room and return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {room.name}
              </h1>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                · {room.genreTag} · {room.isPrivate ? 'Private Room' : 'Public Room'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
              {room.description}
            </p>
          </div>
        </div>

        {/* Shareable Room Code, Invite Link & Connection Telemetry */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181B28] text-xs font-mono text-slate-700 dark:text-slate-300">
            {wsConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span>Live Sync</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>Reconnecting...</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={copyRoomCode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181B28] hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied {room.roomCode}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-violet-500" />
                <span>Code: {room.roomCode}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={copyInviteLink}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-xs font-semibold text-violet-600 dark:text-violet-300 transition-colors whitespace-nowrap"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Invite Link Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>

          {isHost && (
            <button
              type="button"
              onClick={handleCloseRoom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-600 dark:text-red-400 transition-colors whitespace-nowrap"
              title="Close Room for All Participants"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Close Room</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 12-Column Jam Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: YouTube Synchronized Player + WebRTC Voice Chat + Room Participants */}
        <div className="lg:col-span-7 space-y-6">
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

          {/* Room Participants & Host Privileges Bar */}
          <div className="rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Room Participants ({members.length})
                </h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Host: <strong className="text-slate-900 dark:text-white">{room.hostUsername}</strong>
              </span>
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
                        src={member.avatarUrl}
                        alt={member.displayName}
                        referrerPolicy="no-referrer"
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
        </div>

        {/* Right 5 Columns: Shared Music Queue + Real-Time Text Chat */}
        <div className="lg:col-span-5 space-y-6">
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
