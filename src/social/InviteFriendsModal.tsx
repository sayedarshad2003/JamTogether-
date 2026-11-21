import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Check,
  Star,
  Send,
  Search,
  Users,
  Copy,
  Radio,
  Share2,
} from 'lucide-react';
import { JamRoom, Friendship, UserProfile, RoomInviteNotification } from '../types/jam.ts';
import { globalRoomDiscovery } from '../realtime/globalDiscovery.ts';

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: JamRoom;
  currentUser: UserProfile | null;
  friends: Friendship[];
}

export function InviteFriendsModal({
  isOpen,
  onClose,
  room,
  currentUser,
  friends,
}: InviteFriendsModalProps) {
  const [search, setSearch] = useState('');
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  // Sort friends with Close Friends at top
  const sortedFriends = [...friends].sort((a, b) => {
    if (a.isCloseFriend && !b.isCloseFriend) return -1;
    if (!a.isCloseFriend && b.isCloseFriend) return 1;
    return a.friendDisplayName.localeCompare(b.friendDisplayName);
  });

  const filteredFriends = sortedFriends.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      f.friendDisplayName.toLowerCase().includes(q) ||
      f.friendUsername.toLowerCase().includes(q)
    );
  });

  const handleSendInvite = (friend: Friendship) => {
    if (!currentUser) return;

    const inviteNotification: RoomInviteNotification = {
      inviteId: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      roomId: room.roomId,
      roomName: room.name,
      roomCode: room.roomCode,
      isPrivate: room.isPrivate,
      passcode: room.passcode,
      genreTag: room.genreTag,
      senderUserId: currentUser.userId,
      senderUsername: currentUser.username,
      senderDisplayName: currentUser.displayName,
      senderAvatarUrl: currentUser.avatarUrl,
      targetUserId: friend.friendId,
      createdAt: Date.now(),
      read: false,
    };

    globalRoomDiscovery.sendRoomInvite(inviteNotification);

    setInvitedFriendIds((prev) => {
      const next = new Set(prev);
      next.add(friend.friendId);
      return next;
    });
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.origin);
    url.searchParams.set('room', room.roomId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Invite Friends to Jam
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                They will receive an instant notification to join this room.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Room Info Chip & Quick Copy */}
        <div className="p-4 bg-slate-50 dark:bg-[#181B28] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {room.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-[11px] font-bold text-violet-600 dark:text-violet-400">
                {room.roomCode}
              </span>
              {room.isPrivate && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  Private Room (Code Included)
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1f2334] transition-all shrink-0"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>

        {/* Search Friends Filter */}
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter friends..."
              className="bg-transparent text-xs text-slate-900 dark:text-white outline-none flex-1 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Friends List */}
        <div className="p-4 pt-2 overflow-y-auto flex-1 space-y-2">
          {filteredFriends.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-2">
              <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p>
                {friends.length === 0
                  ? 'No connected friends yet. Add friends from the Dashboard directory to invite them directly!'
                  : 'No friends match your search.'}
              </p>
            </div>
          ) : (
            filteredFriends.map((friend) => {
              const isInvited = invitedFriendIds.has(friend.friendId);
              const avatar =
                friend.friendAvatarUrl ||
                `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                  friend.friendDisplayName || friend.friendUsername
                )}`;

              return (
                <div
                  key={friend.friendId}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    friend.isCloseFriend
                      ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30'
                      : 'bg-slate-50 dark:bg-[#181B28] border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative">
                      <img
                        src={avatar}
                        alt={friend.friendDisplayName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                      {friend.isCloseFriend && (
                        <span className="absolute -top-1 -right-1 text-xs">⭐</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {friend.friendDisplayName}
                        </p>
                        {friend.isCloseFriend && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-400/20 text-amber-600 dark:text-amber-400">
                            Close
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        @{friend.friendUsername}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isInvited}
                    onClick={() => handleSendInvite(friend)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0 ${
                      isInvited
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                        : 'bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white'
                    }`}
                  >
                    {isInvited ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Invited</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Invite</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
