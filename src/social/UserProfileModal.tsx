import React, { useState } from 'react';
import {
  X,
  Star,
  UserPlus,
  UserMinus,
  Check,
  Radio,
  Sparkles,
  Music,
  Calendar,
  Shield,
  Send,
} from 'lucide-react';
import { UserProfile, Friendship } from '../types/jam.ts';
import { apiRequest } from '../aws-services/apiClient.ts';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: UserProfile | {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    email?: string;
    favoriteGenres?: string[];
    status?: string;
    currentRoomId?: string;
    currentRoomName?: string;
    createdAt?: number;
    isCloseFriend?: boolean;
  } | null;
  currentUser: UserProfile | null;
  friends: Friendship[];
  activeRoomId?: string | null;
  onRefreshDashboard?: () => Promise<void>;
  onJoinRoom?: (roomId: string) => void;
  onInviteToRoom?: (friendId: string) => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  friends,
  activeRoomId,
  onRefreshDashboard,
  onJoinRoom,
  onInviteToRoom,
}: UserProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen || !targetUser) return null;

  const isSelf = currentUser && (currentUser.userId === targetUser.userId || currentUser.username === targetUser.username);
  const existingFriend = friends.find(
    (f) =>
      f.friendId === targetUser.userId ||
      f.friendUsername.toLowerCase() === targetUser.username.toLowerCase()
  );
  const isFriend = Boolean(existingFriend);
  const isCloseFriend = Boolean(existingFriend?.isCloseFriend || (targetUser as any).isCloseFriend);

  const handleToggleCloseFriend = async () => {
    if (!existingFriend) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      await apiRequest('/api/friends/toggle-close', {
        method: 'POST',
        body: JSON.stringify({ friendId: existingFriend.friendId }),
      });
      setStatusMsg(isCloseFriend ? 'Removed from Close Friends.' : 'Added to Close Friends! ⭐');
      await onRefreshDashboard?.();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      await apiRequest('/api/friends/add', {
        method: 'POST',
        body: JSON.stringify({ usernameOrId: targetUser.username || targetUser.userId }),
      });
      setStatusMsg(`Connected with @${targetUser.username}!`);
      await onRefreshDashboard?.();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!existingFriend) return;
    if (!window.confirm(`Are you sure you want to remove @${targetUser.username} from your friends?`)) {
      return;
    }
    setLoading(true);
    setStatusMsg(null);
    try {
      await apiRequest(`/api/friends/${existingFriend.friendId}`, {
        method: 'DELETE',
      });
      setStatusMsg(`Removed @${targetUser.username} from friends.`);
      await onRefreshDashboard?.();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const avatar =
    targetUser.avatarUrl ||
    `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
      targetUser.displayName || targetUser.username || 'user'
    )}`;

  const genres = targetUser.favoriteGenres && targetUser.favoriteGenres.length > 0
    ? targetUser.favoriteGenres
    : ['Indie Rock', 'Electronic', 'Synthwave', 'Lo-Fi'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Banner with gradient header */}
        <div className="relative h-24 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 p-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {isCloseFriend && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400 text-slate-900 font-bold text-[10px] shadow-md">
              <Star className="w-3 h-3 fill-amber-900 text-amber-900" />
              <span>Close Friend</span>
            </div>
          )}
        </div>

        {/* Profile Content */}
        <div className="p-6 pt-0 relative space-y-4">
          {/* Avatar over banner */}
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="relative">
              <img
                src={avatar}
                alt={targetUser.displayName}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-2xl object-cover bg-white dark:bg-[#181B28] p-1 border-4 border-white dark:border-[#11131C] shadow-lg"
              />
              <span
                className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white dark:border-[#11131C] ${
                  targetUser.status === 'in_room'
                    ? 'bg-purple-500'
                    : targetUser.status === 'offline'
                    ? 'bg-slate-400'
                    : 'bg-emerald-500'
                }`}
                title={`Status: ${targetUser.status || 'Online'}`}
              />
            </div>

            {/* Quick header action */}
            {!isSelf && isFriend && (
              <button
                type="button"
                disabled={loading}
                onClick={handleToggleCloseFriend}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                  isCloseFriend
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isCloseFriend ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>{isCloseFriend ? 'Close Friend' : 'Make Close Friend'}</span>
              </button>
            )}
          </div>

          {/* User Details */}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {targetUser.displayName || targetUser.username}
              </h3>
              {isCloseFriend && <span className="text-amber-400 text-sm">⭐</span>}
            </div>
            <p className="text-xs font-mono text-violet-600 dark:text-violet-400">
              @{targetUser.username}
            </p>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-600 dark:text-violet-300 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Bio */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/80 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {targetUser.bio || 'Music lover, sound explorer, and live session listener on JamTogether.'}
            </p>
          </div>

          {/* Live Activity (if currently in a room) */}
          {targetUser.currentRoomId && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Radio className="w-4 h-4 text-purple-500 shrink-0 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                    Listening Live
                  </p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {targetUser.currentRoomName || 'Jam Lounge'}
                  </p>
                </div>
              </div>
              {onJoinRoom && (
                <button
                  type="button"
                  onClick={() => {
                    onJoinRoom(targetUser.currentRoomId!);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 shadow-md shrink-0"
                >
                  Join Room
                </button>
              )}
            </div>
          )}

          {/* Favorite Genres */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Music className="w-3 h-3" />
              <span>Favorite Music Vibes</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-[#181B28] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          {!isSelf && (
            <div className="pt-2 flex items-center gap-2">
              {isFriend && existingFriend ? (
                <>
                  {activeRoomId && onInviteToRoom && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        onInviteToRoom(existingFriend.friendId);
                        setStatusMsg(`Sent room invitation to @${targetUser.username}!`);
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Invite to Room</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleRemoveFriend}
                    className="py-2.5 px-3 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10 border border-red-500/20 transition-all flex items-center gap-1.5"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>Remove Friend</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleAddFriend}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add as Friend</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
