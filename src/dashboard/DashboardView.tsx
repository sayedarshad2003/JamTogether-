import React, { useState } from 'react';
import {
  Plus,
  Hash,
  Users,
  Clock,
  Headphones,
  UserPlus,
  ArrowRight,
  Radio,
  Check,
  Music,
  ListMusic,
  Sparkles,
  Play,
  Trash2,
  FolderHeart,
  Share2,
  Flame,
  Lock,
  X,
  Star,
  UserMinus,
  Eye,
  Search,
} from 'lucide-react';
import {
  JamRoom,
  Friendship,
  ListeningHistoryEntry,
  UserProfile,
  UserPlaylist,
} from '../types/jam.ts';
import { apiRequest } from '../aws-services/apiClient.ts';
import { UserProfileModal } from '../social/UserProfileModal.tsx';
import heroImage from '../assets/images/hero_listening_lounge_1794736637703.jpg';

interface DashboardViewProps {
  user: UserProfile | null;
  rooms: JamRoom[];
  myCreatedRooms?: JamRoom[];
  recentlyJoinedRooms: JamRoom[];
  userPlaylists?: UserPlaylist[];
  friends: Friendship[];
  allUsers: UserProfile[];
  history: ListeningHistoryEntry[];
  onJoinRoom: (roomId: string) => void;
  onOpenCreateModal: () => void;
  onOpenJoinModal: () => void;
  onOpenAuthModal?: () => void;
  onRefreshDashboard: () => Promise<void>;
}

export function DashboardView({
  user,
  rooms,
  myCreatedRooms = [],
  recentlyJoinedRooms = [],
  userPlaylists = [],
  friends,
  allUsers,
  history,
  onJoinRoom,
  onOpenCreateModal,
  onOpenJoinModal,
  onOpenAuthModal,
  onRefreshDashboard,
}: DashboardViewProps) {
  const [quickCode, setQuickCode] = useState('');
  const [quickCodeError, setQuickCodeError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'rooms' | 'my-jams' | 'friends' | 'history'>('rooms');
  const [friendInput, setFriendInput] = useState('');
  const [friendStatusMsg, setFriendStatusMsg] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [selectedProfileUser, setSelectedProfileUser] = useState<any | null>(null);
  const [communitySearch, setCommunitySearch] = useState('');
  const [togglingFriendId, setTogglingFriendId] = useState<string | null>(null);

  // Private Room Passcode Verification State
  const [selectedPrivateRoom, setSelectedPrivateRoom] = useState<JamRoom | null>(null);
  const [privatePasscodeInput, setPrivatePasscodeInput] = useState('');
  const [privatePasscodeError, setPrivatePasscodeError] = useState<string | null>(null);

  const handleRoomClick = (room: JamRoom) => {
    if (!user) {
      onOpenAuthModal?.();
      return;
    }
    const isHost = Boolean(
      user &&
        (user.userId === room.hostUserId ||
          user.username?.toLowerCase() === room.hostUsername?.toLowerCase() ||
          user.email === 'arshadsayed232@gmail.com')
    );
    const isAlreadyUnlocked = sessionStorage.getItem(`jamtogether_unlocked_${room.roomId}`) === 'true';

    if (room.isPrivate && !isHost && !isAlreadyUnlocked) {
      setSelectedPrivateRoom(room);
      setPrivatePasscodeInput('');
      setPrivatePasscodeError(null);
      return;
    }

    onJoinRoom(room.roomId);
  };

  const handleUnlockAndJoinPrivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPrivateRoom) return;
    const clean = privatePasscodeInput.trim().toUpperCase();
    const isMatch = (
      clean === selectedPrivateRoom.roomCode.toUpperCase() ||
      clean === selectedPrivateRoom.roomCode.replace(/^JAM-?/i, '').toUpperCase() ||
      (selectedPrivateRoom.passcode && clean === selectedPrivateRoom.passcode.toUpperCase()) ||
      (selectedPrivateRoom.passcode && clean === selectedPrivateRoom.passcode.replace(/^JAM-?/i, '').toUpperCase())
    );

    if (isMatch) {
      sessionStorage.setItem(`jamtogether_unlocked_${selectedPrivateRoom.roomId}`, 'true');
      const targetRoomId = selectedPrivateRoom.roomId;
      setSelectedPrivateRoom(null);
      onJoinRoom(targetRoomId);
    } else {
      setPrivatePasscodeError('Incorrect room code. Please ask the host for the code to join.');
    }
  };

  const handleQuickJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuthModal?.();
      return;
    }
    const clean = quickCode.trim().replace(/^JAM-?/i, '').toUpperCase();
    if (!clean) return;
    setQuickCodeError(null);
    try {
      const res = await apiRequest<{ room: JamRoom }>('/api/rooms/join-code', {
        method: 'POST',
        body: JSON.stringify({ roomCode: clean }),
      });
      if (res?.room?.roomId) {
        sessionStorage.setItem(`jamtogether_unlocked_${res.room.roomId}`, 'true');
        onJoinRoom(res.room.roomId);
      }
    } catch (err) {
      setQuickCodeError((err as Error).message || 'Room not found with this code.');
    }
  };

  const handleDeleteRoom = async (roomId: string, roomCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete and close this room?')) return;
    setDeletingRoomId(roomId);
    try {
      await apiRequest(`/api/rooms/${roomId}`, { method: 'DELETE' });
      await onRefreshDashboard();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeletingRoomId(null);
    }
  };

  const handleAddFriend = async (usernameToInvite: string) => {
    if (!usernameToInvite.trim()) return;
    setAddingFriend(true);
    setFriendStatusMsg(null);
    try {
      await apiRequest('/api/friends/add', {
        method: 'POST',
        body: JSON.stringify({ usernameOrId: usernameToInvite.trim() }),
      });
      setFriendInput('');
      setFriendStatusMsg(`Connected with @${usernameToInvite.trim()}`);
      await onRefreshDashboard();
    } catch (err) {
      setFriendStatusMsg((err as Error).message);
    } finally {
      setAddingFriend(false);
    }
  };

  const handleToggleCloseFriend = async (friendId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTogglingFriendId(friendId);
    try {
      await apiRequest('/api/friends/toggle-close', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      });
      await onRefreshDashboard();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setTogglingFriendId(null);
    }
  };

  const handleRemoveFriend = async (friendId: string, username: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`Are you sure you want to remove @${username} from your friends?`)) return;
    try {
      await apiRequest(`/api/friends/${friendId}`, { method: 'DELETE' });
      await onRefreshDashboard();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6 sm:space-y-8">
      {/* 1. Mobile-First Modern Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-900/90 via-slate-900 to-black border border-violet-500/20 shadow-xl p-5 sm:p-8">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-violet-600/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Synchronized Social Music</span>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-snug">
              Listen to music together in lockstep.
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Create a live room, queue YouTube tracks, and talk over crystal-clear voice chat with friends anywhere.
            </p>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onOpenAuthModal?.();
                  } else {
                    onOpenCreateModal();
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-600/30 transition-transform active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Host a Jam</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onOpenAuthModal?.();
                  } else {
                    onOpenJoinModal();
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/15 backdrop-blur-md transition-colors"
              >
                <Hash className="w-4 h-4 text-violet-400" />
                <span>Enter Room Code</span>
              </button>
            </div>
          </div>

          {/* Quick Join Input Box on Desktop & Tablet */}
          <div className="w-full md:w-80 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-violet-400" />
                <span>Quick Join by Code</span>
              </span>
              <span className="text-[11px] text-violet-300 font-mono">4-letter code</span>
            </div>

            <form onSubmit={handleQuickJoinSubmit} className="space-y-2">
              <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 focus-within:border-violet-400 transition-colors">
                <input
                  type="text"
                  maxLength={10}
                  value={quickCode}
                  onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FBAR"
                  className="bg-transparent text-sm font-mono font-bold tracking-wider text-white placeholder-slate-400 outline-none flex-1 uppercase"
                />
                <button
                  type="submit"
                  disabled={!quickCode.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-all flex items-center gap-1 shrink-0"
                >
                  <span>Join</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {quickCodeError && (
                <p className="text-[11px] text-rose-400 font-medium px-1">{quickCodeError}</p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* 2. Mobile-Friendly Navigation Filter Tabs */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2 bg-slate-200/60 dark:bg-[#11131C] p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveFilter('rooms')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeFilter === 'rooms'
                ? 'bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-violet-500 dark:text-white" />
            <span>Live Jams</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-black/30">
              {rooms.length}
            </span>
          </button>

          {myCreatedRooms.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('my-jams')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
                activeFilter === 'my-jams'
                  ? 'bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>My Rooms</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-black/30">
                {myCreatedRooms.length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveFilter('friends')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeFilter === 'friends'
                ? 'bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-blue-500" />
            <span>Friends</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-black/30">
              {friends.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('history')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeFilter === 'history'
                ? 'bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            <span>History</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!user) {
              onOpenAuthModal?.();
            } else {
              onOpenCreateModal();
            }
          }}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Jam</span>
        </button>
      </div>

      {/* 3. Filter Content: LIVE JAMS */}
      {activeFilter === 'rooms' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-violet-500" />
              <span>Active Jam Sessions</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {rooms.length} room{rooms.length === 1 ? '' : 's'} live
            </span>
          </div>

          {rooms.length === 0 ? (
            <div className="p-8 sm:p-12 text-center rounded-3xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto">
                <Headphones className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                No Live Jams Right Now
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Be the first to create a synchronized room! Queue your favorite songs and invite your friends.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onOpenAuthModal?.();
                  } else {
                    onOpenCreateModal();
                  }
                }}
                className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 transition-all shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Jam Room</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => {
                const isMyRoom =
                  user &&
                  (user.userId === room.hostUserId ||
                    user.username?.toLowerCase() === room.hostUsername?.toLowerCase() ||
                    user.email === 'arshadsayed232@gmail.com');

                return (
                  <div
                    key={room.roomId}
                    onClick={() => handleRoomClick(room)}
                    className="cursor-pointer group flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800/80 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/5 transition-all space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Top Row: Title + Status Pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-violet-500 transition-colors">
                            {room.name}
                          </h3>
                          {room.isPrivate && !isMyRoom ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5 flex items-center gap-1">
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>Private Jam · Code Required</span>
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {room.genreTag || 'Music'} · Code:{' '}
                              <span className="font-mono font-bold text-violet-600 dark:text-violet-400">
                                {room.roomCode}
                              </span>
                              {room.isPrivate && isMyRoom && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Private
                                </span>
                              )}
                            </p>
                          )}
                        </div>

                        {room.isPrivate ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/20">
                            <Lock className="w-3 h-3" />
                            <span>Private</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{room.activeMemberCount || 1} online</span>
                          </span>
                        )}
                      </div>

                      {/* Currently Playing Track Card */}
                      {room.playback?.track ? (
                        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#161726] border border-slate-100 dark:border-slate-800">
                          <img
                            src={room.playback.track.thumbnailUrl}
                            alt={room.playback.track.title}
                            referrerPolicy="no-referrer"
                            className="w-12 h-10 rounded-lg object-cover bg-black shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {room.playback.track.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {room.playback.track.channelTitle}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 italic">
                          {room.description || 'Open room ready for music.'}
                        </p>
                      )}
                    </div>

                    {/* Footer Row: Host info & Enter button */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={
                            room.hostAvatarUrl ||
                            `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                              room.hostUsername || 'Host'
                            )}`
                          }
                          alt={room.hostUsername}
                          referrerPolicy="no-referrer"
                          className="w-6 h-6 rounded-full object-cover border border-violet-500/40"
                        />
                        <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {room.hostUsername}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isMyRoom && (
                          <button
                            type="button"
                            disabled={deletingRoomId === room.roomId}
                            onClick={(e) => handleDeleteRoom(room.roomId, room.roomCode, e)}
                            title="Delete this room"
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {room.isPrivate && !isMyRoom ? (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 group-hover:bg-amber-500 transition-colors shadow-sm">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Enter Code</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-violet-600 group-hover:bg-violet-500 transition-colors">
                            <Headphones className="w-3.5 h-3.5" />
                            <span>Tune In</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 4. Filter Content: MY CREATED JAMS */}
      {activeFilter === 'my-jams' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Rooms Hosted By You ({myCreatedRooms.length})</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myCreatedRooms.map((room) => (
              <div
                key={room.roomId}
                onClick={() => handleRoomClick(room)}
                className="cursor-pointer group flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#11131C] border-2 border-violet-500/30 hover:border-violet-500 shadow-sm transition-all space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-violet-500">
                        {room.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Code: <span className="font-mono font-bold text-violet-500">{room.roomCode}</span>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      Host
                    </span>
                  </div>

                  {room.playback?.track && (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#161726]">
                      <img
                        src={room.playback.track.thumbnailUrl}
                        alt={room.playback.track.title}
                        className="w-12 h-10 rounded-lg object-cover bg-black shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {room.playback.track.title}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {room.playback.track.channelTitle}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={deletingRoomId === room.roomId}
                    onClick={(e) => handleDeleteRoom(room.roomId, room.roomCode, e)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRoomClick(room);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-md"
                  >
                    Resume Session
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Filter Content: FRIENDS & SOCIAL */}
      {activeFilter === 'friends' && (
        <section className="space-y-6 max-w-4xl">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-500" />
                <span>Friends & Community Listeners</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Connect with companions, pin your close friends, and invite them directly into live listening rooms.
              </p>
            </div>

            {/* Manual Quick Add Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddFriend(friendInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={friendInput}
                onChange={(e) => setFriendInput(e.target.value)}
                placeholder="Enter exact @username..."
                className="w-48 sm:w-56 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="submit"
                disabled={addingFriend || !friendInput.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-all shrink-0 shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{addingFriend ? 'Adding...' : 'Add'}</span>
              </button>
            </form>
          </div>

          {friendStatusMsg && (
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-600 dark:text-violet-300 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{friendStatusMsg}</span>
            </div>
          )}

          {/* Sub-section 1: Connected Friends (Close friends on TOP ⭐) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-500" />
                <span>Connected Friends ({friends.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Close friends (⭐) are pinned to the top of your list
              </span>
            </div>

            {friends.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300">No friends added yet.</p>
                <p className="text-[11px] text-slate-400">Search the community below and click "Add Friend" to start connecting!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(() => {
                  const sorted = [...friends].sort((a, b) => {
                    if (a.isCloseFriend && !b.isCloseFriend) return -1;
                    if (!a.isCloseFriend && b.isCloseFriend) return 1;
                    return a.friendDisplayName.localeCompare(b.friendDisplayName);
                  });
                  return sorted.map((f) => {
                    const avatar =
                      f.friendAvatarUrl ||
                      `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                        f.friendDisplayName || f.friendUsername
                      )}`;

                    return (
                      <div
                        key={f.friendId}
                        onClick={() =>
                          setSelectedProfileUser({
                            userId: f.friendId,
                            username: f.friendUsername,
                            displayName: f.friendDisplayName,
                            avatarUrl: f.friendAvatarUrl,
                            status: f.friendOnlineStatus,
                            currentRoomId: f.friendCurrentRoomId,
                            currentRoomName: f.friendCurrentRoomName,
                            isCloseFriend: f.isCloseFriend,
                          })
                        }
                        className={`cursor-pointer group p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 shadow-sm hover:shadow-md ${
                          f.isCloseFriend
                            ? 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/40 hover:border-amber-500'
                            : 'bg-white dark:bg-[#11131C] border-slate-200 dark:border-slate-800 hover:border-violet-500/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative shrink-0">
                            <img
                              src={avatar}
                              alt={f.friendDisplayName}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                            />
                            <span
                              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-[#11131C] ${
                                f.friendOnlineStatus === 'in_room'
                                  ? 'bg-purple-500'
                                  : f.friendOnlineStatus === 'offline'
                                  ? 'bg-slate-400'
                                  : 'bg-emerald-500'
                              }`}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-violet-500 transition-colors">
                                {f.friendDisplayName}
                              </p>
                              {f.isCloseFriend && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-400/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                  ⭐ Close
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">
                              @{f.friendUsername}
                            </p>
                            {f.friendCurrentRoomName && (
                              <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold truncate flex items-center gap-1 mt-0.5">
                                <Radio className="w-2.5 h-2.5 animate-pulse" />
                                <span>In {f.friendCurrentRoomName}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Friend Action Icons */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={togglingFriendId === f.friendId}
                            onClick={(e) => handleToggleCloseFriend(f.friendId, e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              f.isCloseFriend
                                ? 'text-amber-500 hover:text-amber-600 bg-amber-500/10'
                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={
                              f.isCloseFriend
                                ? 'Remove from Close Friends'
                                : 'Make Close Friend (Pin to Top)'
                            }
                          >
                            <Star
                              className={`w-4 h-4 ${
                                f.isCloseFriend ? 'fill-amber-400' : ''
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedProfileUser({
                                userId: f.friendId,
                                username: f.friendUsername,
                                displayName: f.friendDisplayName,
                                avatarUrl: f.friendAvatarUrl,
                                status: f.friendOnlineStatus,
                                currentRoomId: f.friendCurrentRoomId,
                                currentRoomName: f.friendCurrentRoomName,
                                isCloseFriend: f.isCloseFriend,
                              })
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="View Full Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) =>
                              handleRemoveFriend(f.friendId, f.friendUsername, e)
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Remove Friend"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Sub-section 2: Discover Friends & Community Directory */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Discover Friends & Community Directory</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Search listeners across JamTogether to connect and listen in sync.
                </p>
              </div>

              {/* Filter search bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={communitySearch}
                  onChange={(e) => setCommunitySearch(e.target.value)}
                  placeholder="Filter community by name or vibe..."
                  className="w-full pl-8 pr-3.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* Community User Cards Grid */}
            {(() => {
              const query = communitySearch.trim().toLowerCase();
              const friendUsernames = new Set(
                friends.map((f) => f.friendUsername.toLowerCase())
              );
              const friendIds = new Set(friends.map((f) => f.friendId));

              // Exclude currently logged in user
              const eligibleUsers = allUsers.filter(
                (u) =>
                  !user ||
                  (u.userId !== user.userId &&
                    u.username?.toLowerCase() !== user.username?.toLowerCase())
              );

              const matchingUsers = eligibleUsers.filter((u) => {
                if (!query) return true;
                return (
                  u.displayName?.toLowerCase().includes(query) ||
                  u.username?.toLowerCase().includes(query) ||
                  u.bio?.toLowerCase().includes(query) ||
                  (u.favoriteGenres &&
                    u.favoriteGenres.some((g) => g.toLowerCase().includes(query)))
                );
              });

              if (matchingUsers.length === 0) {
                return (
                  <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-3">
                    <p className="text-xs text-slate-500">
                      No registered user found matching "{communitySearch}".
                    </p>
                    {communitySearch.trim() && (
                      <button
                        type="button"
                        onClick={() => handleAddFriend(communitySearch)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md transition-all"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add "@{communitySearch.replace(/^@/, '')}" as Friend</span>
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {matchingUsers.map((commUser) => {
                    const isAlreadyFriend =
                      friendUsernames.has(commUser.username.toLowerCase()) ||
                      friendIds.has(commUser.userId);
                    const avatar =
                      commUser.avatarUrl ||
                      `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                        commUser.displayName || commUser.username || 'user'
                      )}`;

                    return (
                      <div
                        key={commUser.userId}
                        onClick={() => setSelectedProfileUser(commUser)}
                        className="cursor-pointer group p-3.5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 hover:border-violet-500/40 shadow-sm transition-all flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <img
                            src={avatar}
                            alt={commUser.displayName}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-violet-500 transition-colors">
                              {commUser.displayName || commUser.username}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              @{commUser.username}
                            </p>
                            {commUser.favoriteGenres &&
                              commUser.favoriteGenres.length > 0 && (
                                <p className="text-[10px] text-violet-500 truncate mt-0.5">
                                  {commUser.favoriteGenres.slice(0, 2).join(' · ')}
                                </p>
                              )}
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedProfileUser(commUser)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="View Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isAlreadyFriend ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <Check className="w-3 h-3" />
                              <span>Connected</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddFriend(commUser.username)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* 6. Filter Content: LISTENING HISTORY */}
      {activeFilter === 'history' && (
        <section className="space-y-4 max-w-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>Recently Played Tracks</span>
            </h2>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              No listening history recorded yet. Join any jam room to start playing!
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-[#11131C] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {history.map((entry) => (
                <div key={entry.entryId} className="flex items-center justify-between gap-3 p-3.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-violet-600/10 text-violet-600 flex items-center justify-center shrink-0">
                      <Music className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {entry.track?.title || 'Unknown Track'}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">in {entry.roomName}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {new Date(entry.playedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Private Room Passcode Verification Modal */}
      {selectedPrivateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#11131C] border border-amber-500/30 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Private Jam Session
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Host passcode required to enter
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPrivateRoom(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUnlockAndJoinPrivate} className="p-6 space-y-4">
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {selectedPrivateRoom.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Hosted by <strong className="text-slate-800 dark:text-slate-200">{selectedPrivateRoom.hostUsername}</strong>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                🔒 This listening session is locked and private. You must enter the Room Code or Passcode provided by the host to join and listen.
              </div>

              {privatePasscodeError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 font-medium">
                  {privatePasscodeError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Enter Room Code / Passcode
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={privatePasscodeInput}
                  onChange={(e) => setPrivatePasscodeInput(e.target.value)}
                  placeholder="e.g. JAM-808X or Passcode"
                  className="w-full px-3.5 py-2.5 text-sm font-mono font-bold uppercase rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPrivateRoom(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Unlock & Join Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={Boolean(selectedProfileUser)}
        onClose={() => setSelectedProfileUser(null)}
        targetUser={selectedProfileUser}
        currentUser={user}
        friends={friends}
        onRefreshDashboard={onRefreshDashboard}
        onJoinRoom={onJoinRoom}
      />
    </div>
  );
}
