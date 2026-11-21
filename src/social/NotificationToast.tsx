import React, { useEffect, useState, useRef } from 'react';
import {
  Bell,
  X,
  Radio,
  ArrowRight,
  Music,
  Check,
  Sparkles,
  Lock,
} from 'lucide-react';
import { RoomInviteNotification, UserProfile } from '../types/jam.ts';
import { globalRoomDiscovery } from '../realtime/globalDiscovery.ts';

interface NotificationToastProps {
  currentUser: UserProfile | null;
  onJoinRoom: (roomId: string) => void;
}

export function NotificationToast({
  currentUser,
  onJoinRoom,
}: NotificationToastProps) {
  const [activeToast, setActiveToast] = useState<RoomInviteNotification | null>(null);
  const seenInviteIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser?.userId) return;

    const unsub = globalRoomDiscovery.subscribeNotifications(
      currentUser.userId,
      (notifications) => {
        if (!notifications || notifications.length === 0) return;
        const latest = notifications[0];
        // If this invite hasn't been shown in this session yet and is unread
        if (latest && !seenInviteIdsRef.current.has(latest.inviteId) && !latest.read) {
          seenInviteIdsRef.current.add(latest.inviteId);
          setActiveToast(latest);

          // Auto-hide after 12 seconds
          const timer = setTimeout(() => {
            setActiveToast((curr) => (curr?.inviteId === latest.inviteId ? null : curr));
          }, 12000);
          return () => clearTimeout(timer);
        }
      }
    );

    return unsub;
  }, [currentUser?.userId]);

  if (!activeToast) return null;

  const handleJoin = () => {
    if (activeToast.isPrivate) {
      sessionStorage.setItem(`jamtogether_unlocked_${activeToast.roomId}`, 'true');
    }
    if (currentUser?.userId) {
      globalRoomDiscovery.markNotificationRead(currentUser.userId, activeToast.inviteId);
    }
    const targetRoomId = activeToast.roomId;
    setActiveToast(null);
    onJoinRoom(targetRoomId);
  };

  const handleDismiss = () => {
    if (currentUser?.userId) {
      globalRoomDiscovery.markNotificationRead(currentUser.userId, activeToast.inviteId);
    }
    setActiveToast(null);
  };

  const senderAvatar =
    activeToast.senderAvatarUrl ||
    `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
      activeToast.senderDisplayName || activeToast.senderUsername || 'host'
    )}`;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none animate-in slide-in-from-top-4 duration-300">
      <div className="pointer-events-auto rounded-2xl bg-gradient-to-r from-violet-950/95 via-slate-900/95 to-slate-950/95 text-white p-4 shadow-2xl border border-violet-500/40 backdrop-blur-xl flex items-center justify-between gap-3">
        {/* Left: Avatar & Text */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0">
            <img
              src={senderAvatar}
              alt={activeToast.senderDisplayName}
              className="w-10 h-10 rounded-full object-cover border-2 border-violet-400 shadow-md"
            />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-violet-600 text-white flex items-center justify-center text-[9px] shadow">
              🎵
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                Jam Room Invitation
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-violet-500/20 text-violet-300">
                {activeToast.roomCode}
              </span>
            </div>
            <p className="text-xs font-bold text-white truncate">
              {activeToast.senderDisplayName} invited you to join
            </p>
            <p className="text-[11px] text-slate-300 truncate font-medium">
              "{activeToast.roomName}"
            </p>
          </div>
        </div>

        {/* Right: Join & Close Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleJoin}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-md shadow-violet-600/30 transition-all flex items-center gap-1 active:scale-95"
          >
            <span>Join</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface NotificationBellProps {
  currentUser: UserProfile | null;
  onJoinRoom: (roomId: string) => void;
}

export function NotificationBell({
  currentUser,
  onJoinRoom,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState<RoomInviteNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser?.userId) {
      setNotifications([]);
      return;
    }

    const unsub = globalRoomDiscovery.subscribeNotifications(
      currentUser.userId,
      (list) => {
        setNotifications(list);
      }
    );

    return unsub;
  }, [currentUser?.userId]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleJoinInvite = (invite: RoomInviteNotification) => {
    if (invite.isPrivate) {
      sessionStorage.setItem(`jamtogether_unlocked_${invite.roomId}`, 'true');
    }
    if (currentUser?.userId) {
      globalRoomDiscovery.markNotificationRead(currentUser.userId, invite.inviteId);
    }
    setIsOpen(false);
    onJoinRoom(invite.roomId);
  };

  const handleDismiss = (inviteId: string) => {
    if (currentUser?.userId) {
      globalRoomDiscovery.dismissNotification(currentUser.userId, inviteId);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Invitations"
        title="Room Invitations"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-500" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Room Invitations
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {notifications.length} invite{notifications.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <p>No room invitations yet.</p>
                <p className="text-[11px] text-slate-500">
                  When friends invite you to a live listening session, they will appear here!
                </p>
              </div>
            ) : (
              notifications.map((invite) => {
                const avatar =
                  invite.senderAvatarUrl ||
                  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                    invite.senderDisplayName || invite.senderUsername
                  )}`;

                return (
                  <div
                    key={invite.inviteId}
                    className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                      !invite.read
                        ? 'bg-violet-500/5 dark:bg-violet-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-[#181B28]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={avatar}
                        alt={invite.senderDisplayName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {invite.senderDisplayName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          invited you to <span className="font-semibold text-slate-800 dark:text-slate-200">"{invite.roomName}"</span>
                        </p>
                        <span className="text-[10px] font-mono font-bold text-violet-500">
                          {invite.roomCode}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleJoinInvite(invite)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all"
                      >
                        Join
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(invite.inviteId)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
