import React, { useState, useEffect } from 'react';
import { X, Radio, Lock, Globe, Hash, ArrowRight, UserPlus, Star, Check, Users } from 'lucide-react';
import { apiRequest } from '../aws-services/apiClient.ts';
import { JamRoom, Friendship, UserProfile, RoomInviteNotification } from '../types/jam.ts';
import { globalRoomDiscovery } from '../realtime/globalDiscovery.ts';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (room: JamRoom) => void;
  currentUser?: UserProfile | null;
  friends?: Friendship[];
}

export function CreateRoomModal({ isOpen, onClose, onCreated, currentUser, friends = [] }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [genreTag, setGenreTag] = useState('Electronic / Indie');
  const [isPrivate, setIsPrivate] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [initialSong, setInitialSong] = useState('');
  const [selectedInviteFriends, setSelectedInviteFriends] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ room: JamRoom }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          genreTag,
          isPrivate,
          passcode: isPrivate ? passcode.trim().toUpperCase() || undefined : undefined,
          initialSong: initialSong.trim(),
        }),
      });
      setName('');
      setDescription('');
      setInitialSong('');
      setPasscode('');
      if (res?.room?.roomId) {
        sessionStorage.setItem(`jamtogether_unlocked_${res.room.roomId}`, 'true');

        // Dispatch real-time notifications to selected friends
        if (currentUser && selectedInviteFriends.size > 0) {
          selectedInviteFriends.forEach((friendId) => {
            globalRoomDiscovery.sendRoomInvite({
              inviteId: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              roomId: res.room.roomId,
              roomName: res.room.name,
              roomCode: res.room.roomCode,
              isPrivate: res.room.isPrivate,
              passcode: res.room.passcode,
              genreTag: res.room.genreTag,
              senderUserId: currentUser.userId,
              senderUsername: currentUser.username,
              senderDisplayName: currentUser.displayName,
              senderAvatarUrl: currentUser.avatarUrl,
              targetUserId: friendId,
              createdAt: Date.now(),
              read: false,
            });
          });
        }
      }
      onCreated(res.room);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Create a Listening Jam Room
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Room Name
            </label>
            <input
              type="text"
              placeholder="e.g., Late Night Vinyl & Synth Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="What are we listening to tonight?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Genre / Vibe
              </label>
              <input
                type="text"
                value={genreTag}
                onChange={(e) => setGenreTag(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Room Visibility
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#181B28]">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    !isPrivate
                      ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    isPrivate
                      ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private</span>
                </button>
              </div>
            </div>
          </div>

          {isPrivate && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Mandatory Room Code Required</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                This room will be locked. Any user who wants to join must enter the Room Code or Passcode you choose.
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Custom Room Code / Passcode (Optional)
                </label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                  placeholder="e.g. VIP-2025 or SECRET (blank for auto code)"
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-[#181B28] border border-amber-500/40 text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Opening Track (Optional)
            </label>
            <input
              type="text"
              value={initialSong}
              onChange={(e) => setInitialSong(e.target.value)}
              placeholder="Paste YouTube link / song name, or leave blank to choose inside room"
              className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Leave blank to start with a clean room and queue any song live inside.
            </p>
          </div>

          {/* Optional Friend Invitations */}
          {friends.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-violet-500" />
                  <span>Invite Friends (Optional)</span>
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {selectedInviteFriends.size} selected
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selected friends will receive an instant notification to join your room.
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/80 dark:border-slate-800">
                {(() => {
                  const sortedFriends = [...friends].sort((a, b) => {
                    if (a.isCloseFriend && !b.isCloseFriend) return -1;
                    if (!a.isCloseFriend && b.isCloseFriend) return 1;
                    return a.friendDisplayName.localeCompare(b.friendDisplayName);
                  });
                  return sortedFriends.map((f) => {
                    const isSelected = selectedInviteFriends.has(f.friendId);
                    return (
                      <button
                        key={f.friendId}
                        type="button"
                        onClick={() => {
                          setSelectedInviteFriends((prev) => {
                            const next = new Set(prev);
                            if (next.has(f.friendId)) next.delete(f.friendId);
                            else next.add(f.friendId);
                            return next;
                          });
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors text-xs ${
                          isSelected
                            ? 'bg-violet-600/15 border border-violet-500/30 text-violet-900 dark:text-violet-200'
                            : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={
                              f.friendAvatarUrl ||
                              `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                                f.friendDisplayName || f.friendUsername
                              )}`
                            }
                            alt={f.friendDisplayName}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                          <div className="min-w-0 truncate">
                            <span className="font-bold text-xs truncate">
                              {f.friendDisplayName}
                            </span>
                            {f.isCloseFriend && (
                              <span className="ml-1 text-[10px]">⭐</span>
                            )}
                            <span className="text-[10px] text-slate-400 ml-1">
                              @{f.friendUsername}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            isSelected
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shadow-sm"
            >
              {loading ? 'Provisioning Room...' : 'Launch Jam Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoined: (room: JamRoom) => void;
}

export function JoinRoomModal({ isOpen, onClose, onJoined }: JoinRoomModalProps) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [discoveredRooms, setDiscoveredRooms] = useState<JamRoom[]>([]);

  useEffect(() => {
    if (isOpen) {
      setDiscoveredRooms(globalRoomDiscovery.getDiscoveredRooms());
      const unsub = globalRoomDiscovery.subscribe((rooms) => {
        setDiscoveredRooms(rooms);
      });
      return unsub;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleJoin = async (codeToJoin: string) => {
    setError(null);
    setLoading(true);
    try {
      // Allow pasting full invite URL or room code
      let cleanCode = codeToJoin.trim();
      const urlMatch = cleanCode.match(/[?&]room=([^&]+)/);
      if (urlMatch) {
        cleanCode = urlMatch[1];
      }
      const res = await apiRequest<{ room: JamRoom }>('/api/rooms/join-code', {
        method: 'POST',
        body: JSON.stringify({ roomCode: cleanCode }),
      });
      setRoomCode('');
      if (res?.room?.roomId) {
        sessionStorage.setItem(`jamtogether_unlocked_${res.room.roomId}`, 'true');
      }
      onJoined(res.room);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Hash className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Join Jam with Room Code
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin(roomCode);
          }}
          className="p-6 space-y-4"
        >
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Enter Room Code or Invite Link
            </label>
            <input
              type="text"
              placeholder="e.g. JAM-7701 or paste invite link"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            {discoveredRooms.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Live Rooms Discovered from Other Devices:
                </p>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {discoveredRooms.map((r) => (
                    <button
                      key={r.roomId}
                      type="button"
                      onClick={() => handleJoin(r.roomCode)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#181B28] hover:bg-violet-500/15 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 transition-colors"
                    >
                      <span className="font-mono font-bold text-violet-600 dark:text-violet-400">
                        {r.roomCode}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate max-w-[120px]">
                        {r.name}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ask the room host for their 4-6 character Room Code (e.g. JAM-7701) or paste the full room invite link.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shadow-sm"
          >
            {loading ? 'Connecting to Room...' : 'Join Jam Session'}
          </button>
        </form>
      </div>
    </div>
  );
}
