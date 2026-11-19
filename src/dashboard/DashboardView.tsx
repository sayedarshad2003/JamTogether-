import React, { useState } from 'react';
import {
  Plus,
  Hash,
  Users,
  Clock,
  Headphones,
  UserPlus,
  ArrowUpRight,
  Radio,
  Check,
  Music,
  ListMusic,
  Sparkles,
  Play,
  Trash2,
  ListPlus,
  FolderHeart,
} from 'lucide-react';
import {
  JamRoom,
  Friendship,
  ListeningHistoryEntry,
  UserProfile,
  UserPlaylist,
} from '../types/jam.ts';
import { apiRequest } from '../aws-services/apiClient.ts';
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
  onRefreshDashboard: () => Promise<void>;
}

function formatRelativeTime(ts: number): string {
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
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
  onRefreshDashboard,
}: DashboardViewProps) {
  const [friendInput, setFriendInput] = useState('');
  const [friendStatusMsg, setFriendStatusMsg] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [historyTab, setHistoryTab] = useState<'jams' | 'songs' | 'playlists'>('jams');
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

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

  const handleDeletePlaylist = async (playlistId: string) => {
    setDeletingPlaylistId(playlistId);
    try {
      await apiRequest(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      await onRefreshDashboard();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  // Combine myCreatedRooms and recentlyJoinedRooms for full Room History
  const roomHistoryMap = new Map<string, JamRoom>();
  for (const r of myCreatedRooms) {
    roomHistoryMap.set(r.roomId, r);
  }
  for (const r of recentlyJoinedRooms) {
    if (!roomHistoryMap.has(r.roomId)) {
      roomHistoryMap.set(r.roomId, r);
    }
  }
  const allUserJamsHistory = Array.from(roomHistoryMap.values());

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* 1. Hero Section: Split Studio Lounge Showcase */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800">
          <div className="space-y-4">
            <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
              Synchronized YouTube Music · WebRTC Voice Chat · AWS DynamoDB
            </p>
            <h1
              className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Listen to music in lockstep and talk live with your favorite people.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
              Host a public or private Jam Room, queue tracks from YouTube, import full playlists, and hang out over
              low-latency peer-to-peer WebRTC voice chat while every beat stays synchronized.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-6 mt-6 border-t border-slate-200 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Create Jam Room</span>
            </button>

            <button
              type="button"
              onClick={onOpenJoinModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 dark:bg-[#181B28] text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
            >
              <Hash className="w-4 h-4 text-violet-500" />
              <span>Join with Room Code</span>
            </button>

            {user ? (
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto hidden sm:inline-flex items-center gap-1.5">
                <span>Signed in as</span>
                <strong className="text-slate-800 dark:text-slate-200">{user.displayName}</strong>
                {user.isGuest ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Guest
                  </span>
                ) : user.authProvider === 'google' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    Google
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400">
                    @{user.username}
                  </span>
                )}
              </span>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 min-h-[260px] bg-slate-900">
          <img
            src={heroImage}
            alt="Analog hi-fi listening lounge with warm studio monitors"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/images/hero_listening_lounge_1794736637703.jpg';
            }}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-6">
            <p className="text-xs text-violet-300 font-medium">
              {rooms.length > 0 ? 'Featured Live Session' : 'Ready to Jam'}
            </p>
            <h3 className="text-lg font-bold text-white mt-1">
              {rooms.length > 0 ? rooms[0].name : 'Start your first community music room'}
            </h3>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/15">
              <span className="text-xs text-slate-300">
                {rooms.length > 0 ? (
                  <>{rooms[0].activeMemberCount} member listening now</>
                ) : (
                  <>Persisted live in Microsoft Excel (.xlsx)</>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (rooms.length > 0) {
                    onJoinRoom(rooms[0].roomId);
                  } else {
                    onOpenCreateModal();
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-xs font-semibold text-slate-900 transition-colors"
              >
                <span>{rooms.length > 0 ? 'Tune In' : 'Create Jam'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. DEDICATED SECTION: MY CREATED JAMS (Immediately highlights user's rooms) */}
      {myCreatedRooms.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-violet-600/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  My Created Jams ({myCreatedRooms.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rooms hosted and created by you — enter anytime to resume your session
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
              Your Rooms
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {myCreatedRooms.map((room) => (
              <div
                key={room.roomId}
                className="flex flex-col justify-between p-5 rounded-2xl bg-gradient-to-b from-white to-violet-50/20 dark:from-[#11131C] dark:to-[#161726] border-2 border-violet-500/40 hover:border-violet-500 transition-all shadow-sm group"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
                          {room.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {room.genreTag} · Code: <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{room.roomCode}</span>
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                      {room.activeMemberCount || 1} online
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {room.description || 'Synchronized listening session & live voice hangout.'}
                  </p>

                  {/* Active Track Preview */}
                  {room.playback?.track && (
                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <img
                        src={room.playback.track.thumbnailUrl}
                        alt={room.playback.track.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-9 rounded-lg object-cover shrink-0 bg-slate-900"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {room.playback.track.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {room.playback.track.channelTitle}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Host: You (@{room.hostUsername})
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingRoomId === room.roomId}
                      onClick={(e) => handleDeleteRoom(room.roomId, room.roomCode, e)}
                      title="Delete this Jam Room"
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onJoinRoom(room.roomId)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-md shadow-violet-500/20 transition-all whitespace-nowrap"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>Enter My Jam</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Live Listening Rooms */}
      <section id="rooms-section" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Live Listening Rooms
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Jump into a live synchronized room or host your own session
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {rooms.length} active rooms
          </span>
        </div>

        {rooms.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto">
              <Radio className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                No Jam Rooms Active
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                No active rooms yet. Create a room, queue songs from YouTube, and invite your friends!
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-md"
            >
              + Create First Jam Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rooms.map((room) => (
              <div
                key={room.roomId}
                className="flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 hover:border-violet-500/50 transition-all"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {room.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {room.genreTag} · Code: <span className="font-mono">{room.roomCode}</span>
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-violet-600 dark:text-violet-400 shrink-0">
                      {room.activeMemberCount} listening
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {room.description}
                  </p>

                  {/* Currently Playing Track Strip */}
                  {room.playback?.track && (
                    <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <img
                        src={room.playback.track.thumbnailUrl}
                        alt={room.playback.track.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-9 rounded-lg object-cover shrink-0 bg-slate-900"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {room.playback.track.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {room.playback.track.channelTitle}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={room.hostAvatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(room.hostUsername || 'Host')}`}
                      alt={room.hostUsername}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(room.hostUsername || 'Host')}`;
                      }}
                      className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      Host: {room.hostUsername}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(user?.userId === room.hostUserId ||
                      user?.username?.toLowerCase() === room.hostUsername?.toLowerCase() ||
                      user?.email === 'arshadsayed232@gmail.com') && (
                      <button
                        type="button"
                        disabled={deletingRoomId === room.roomId}
                        onClick={(e) => handleDeleteRoom(room.roomId, room.roomCode, e)}
                        title="Delete Room"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onJoinRoom(room.roomId)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>Join Room</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recently Joined Rooms Strip */}
        {recentlyJoinedRooms.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2.5">
              Recently Visited by You:
            </p>
            <div className="flex flex-wrap gap-2.5">
              {recentlyJoinedRooms.map((r) => (
                <button
                  key={r.roomId}
                  type="button"
                  onClick={() => onJoinRoom(r.roomId)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 hover:border-violet-500 text-xs text-slate-800 dark:text-slate-200 transition-colors"
                >
                  <Radio className="w-3.5 h-3.5 text-violet-500" />
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-slate-500">{r.roomCode}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. Friends & Social Presence + UNIFIED HISTORY & PLAYLISTS HUB */}
      <section
        id="social-section"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Active Friends & Invitations (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Active Friends ({friends.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Live Presence</span>
          </div>

          {/* Add Friend Input */}
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
              placeholder="Connect with friend by username..."
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={addingFriend}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          {friendStatusMsg && (
            <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{friendStatusMsg}</span>
            </p>
          )}

          <div className="space-y-2.5">
            {friends.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                No friends connected yet. Connect with other users by username.
              </p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.friendId}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/70 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={friend.friendAvatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(friend.friendDisplayName || friend.friendUsername || 'Friend')}`}
                      alt={friend.friendDisplayName}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(friend.friendDisplayName || friend.friendUsername || 'Friend')}`;
                      }}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {friend.friendDisplayName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {friend.friendCurrentRoomName
                          ? `Listening in ${friend.friendCurrentRoomName}`
                          : `@${friend.friendUsername} · Online`}
                      </p>
                    </div>
                  </div>

                  {friend.friendCurrentRoomId && (
                    <button
                      type="button"
                      onClick={() => onJoinRoom(friend.friendCurrentRoomId!)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-300 transition-colors whitespace-nowrap shrink-0"
                    >
                      Join Jam
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {allUsers.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Suggested Music Curators on JamTogether:
              </p>
              <div className="flex flex-wrap gap-2">
                {allUsers.map((u) => (
                  <button
                    key={u.userId}
                    type="button"
                    onClick={() => handleAddFriend(u.username)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#181B28] hover:bg-violet-500/15 text-xs text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <UserPlus className="w-3 h-3 text-violet-500" />
                    <span>{u.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3-TAB UNIFIED HUB: MY JAMS HISTORY, PLAYED SONGS & USER PLAYLISTS (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#181B28]">
              <button
                type="button"
                onClick={() => setHistoryTab('jams')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  historyTab === 'jams'
                    ? 'bg-white dark:bg-[#11131C] text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>My Jam History ({allUserJamsHistory.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setHistoryTab('songs')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  historyTab === 'songs'
                    ? 'bg-white dark:bg-[#11131C] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Played Songs ({history.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setHistoryTab('playlists')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  historyTab === 'playlists'
                    ? 'bg-white dark:bg-[#11131C] text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>My Playlists ({userPlaylists.length})</span>
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-500">
              Excel Synchronized
            </span>
          </div>

          {/* TAB 1: MY CREATED & JOINED JAMS HISTORY */}
          {historyTab === 'jams' && (
            <div>
              {allUserJamsHistory.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Radio className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No jam history found yet. Create a room to start hosting!
                  </p>
                  <button
                    type="button"
                    onClick={onOpenCreateModal}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                  >
                    + Create a Jam Room
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {allUserJamsHistory.map((room) => (
                    <div
                      key={room.roomId}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                            {room.name}
                          </h4>
                          {room.hostUserId === user?.userId || room.hostUsername === user?.username ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400">
                              Host
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              Member
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          Code: <span className="font-mono text-violet-600 dark:text-violet-400 font-semibold">{room.roomCode}</span> · {room.genreTag || 'Music'} · {room.activeMemberCount || 1} online
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(room.hostUserId === user?.userId ||
                          room.hostUsername === user?.username ||
                          user?.email === 'arshadsayed232@gmail.com') && (
                          <button
                            type="button"
                            disabled={deletingRoomId === room.roomId}
                            onClick={(e) => handleDeleteRoom(room.roomId, room.roomCode, e)}
                            title="Delete Jam"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onJoinRoom(room.roomId)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors whitespace-nowrap shadow-sm"
                        >
                          Enter Jam
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RECENTLY PLAYED SONGS */}
          {historyTab === 'songs' && (
            <div>
              {history.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Music className="w-7 h-7 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Songs played inside your Jam Rooms will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {history.map((entry) => (
                    <div
                      key={entry.entryId}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={entry.track.thumbnailUrl}
                          alt={entry.track.title}
                          referrerPolicy="no-referrer"
                          className="w-14 h-10 rounded-lg object-cover shrink-0 bg-slate-900"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {entry.track.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {entry.track.channelTitle} · Played in {entry.roomName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          {formatRelativeTime(entry.playedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onJoinRoom(entry.roomId)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#181B28] hover:bg-violet-500/15 text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap"
                        >
                          Open Room
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: USER-WISE SAVED PLAYLISTS */}
          {historyTab === 'playlists' && (
            <div>
              {userPlaylists.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <FolderHeart className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      No saved playlists yet
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      Import any YouTube playlist inside a Jam Room and save it with your custom name to play it again anytime!
                    </p>
                  </div>
                  {rooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onJoinRoom(rooms[0].roomId)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                      Open Jam & Import Playlist
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {userPlaylists.map((pl) => (
                    <div
                      key={pl.playlistId}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {pl.thumbnailUrl ? (
                          <img
                            src={pl.thumbnailUrl}
                            alt={pl.name}
                            className="w-14 h-10 rounded-lg object-cover shrink-0 bg-slate-900"
                          />
                        ) : (
                          <div className="w-14 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                            <ListMusic className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {pl.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {pl.trackCount} songs · Saved {formatRelativeTime(pl.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {rooms.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onJoinRoom(rooms[0].roomId)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors whitespace-nowrap"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Play in Jam</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deletingPlaylistId === pl.playlistId}
                          onClick={() => handleDeletePlaylist(pl.playlistId)}
                          title="Delete Playlist"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
