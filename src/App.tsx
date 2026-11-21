/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Radio,
  Hash,
  Plus,
  User,
  Sun,
  Moon,
  LogOut,
  Headphones,
  Shield,
} from 'lucide-react';
import { ThemeProvider, useTheme } from './themes/ThemeContext.tsx';
import { AuthProvider, useAuth } from './authentication/AuthContext.tsx';
import { AuthModal } from './authentication/AuthModal.tsx';
import { DashboardView } from './dashboard/DashboardView.tsx';
import { JamRoomView } from './rooms/JamRoomView.tsx';
import { SettingsView } from './settings/SettingsView.tsx';
import { SuperAdminView } from './admin/SuperAdminView.tsx';
import { CreateRoomModal, JoinRoomModal } from './rooms/CreateJoinModals.tsx';
import { apiRequest } from './aws-services/apiClient.ts';
import { globalRoomDiscovery } from './realtime/globalDiscovery.ts';
import {
  JamRoom,
  Friendship,
  ListeningHistoryEntry,
  UserProfile,
  UserPlaylist,
} from './types/jam.ts';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 text-2xl font-bold">
              !
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Unable to load this section
            </h2>
            <p className="text-xs text-slate-500 max-w-md mb-4 font-mono">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.reload();
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-colors shadow-sm"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.href = '/';
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

function JamTogetherShell() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const [hasPromptedAuth, setHasPromptedAuth] = useState(false);

  useEffect(() => {
    if (!authLoading && !user && !hasPromptedAuth) {
      setAuthModalOpen(true);
      setHasPromptedAuth(true);
    }
  }, [authLoading, user, hasPromptedAuth]);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
  });

  const [currentPage, setCurrentPage] = useState<'dashboard' | 'settings' | 'admin'>(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page === 'admin') return 'admin';
    if (page === 'settings') return 'settings';
    if (window.location.hash === '#admin') return 'admin';
    if (window.location.hash === '#settings') return 'settings';
    return 'dashboard';
  });

  const [rooms, setRooms] = useState<JamRoom[]>([]);
  const [myCreatedRooms, setMyCreatedRooms] = useState<JamRoom[]>([]);
  const [recentlyJoinedRooms, setRecentlyJoinedRooms] = useState<JamRoom[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<ListeningHistoryEntry[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiRequest<{
        rooms: JamRoom[];
        myCreatedRooms: JamRoom[];
        recentlyJoinedRooms: JamRoom[];
        friends: Friendship[];
        allUsers: UserProfile[];
        history: ListeningHistoryEntry[];
        userPlaylists: UserPlaylist[];
      }>('/api/dashboard');
      setRooms(res.rooms || []);
      setMyCreatedRooms(res.myCreatedRooms || []);
      setRecentlyJoinedRooms(res.recentlyJoinedRooms || []);
      setFriends(res.friends || []);
      setAllUsers(res.allUsers || []);
      setHistory(res.history || []);
      setUserPlaylists(res.userPlaylists || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, user?.userId]);

  // Subscribe to real-time multi-device global room discovery
  useEffect(() => {
    const unsub = globalRoomDiscovery.subscribe(() => {
      loadDashboard();
    });
    return unsub;
  }, [loadDashboard]);

  const enterRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setCurrentPage('dashboard');
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.pushState({}, '', url.toString());
  };

  const leaveRoom = () => {
    setActiveRoomId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());
    loadDashboard();
  };

  const navigateToDashboard = () => {
    leaveRoom();
    setCurrentPage('dashboard');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('page');
    window.history.pushState({}, '', url.toString());
  };

  const navigateToSettings = () => {
    leaveRoom();
    setCurrentPage('settings');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.set('page', 'settings');
    window.history.pushState({}, '', url.toString());
  };

  const navigateToAdmin = () => {
    leaveRoom();
    setCurrentPage('admin');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.set('page', 'admin');
    window.history.pushState({}, '', url.toString());
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Main Top Navigation Bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-3 bg-white/95 dark:bg-[#090A0F]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateToDashboard();
          }}
          className="flex items-center gap-2 text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-violet-500/20 group-hover:scale-105 transition-transform">
            <Radio className="w-4 h-4" />
          </div>
          <span className="bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">JamTogether</span>
        </a>

        {/* Zone 2: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              navigateToDashboard();
            }}
            className={`hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              currentPage === 'dashboard' && !activeRoomId ? 'text-violet-600 dark:text-violet-400 font-bold' : ''
            }`}
          >
            Dashboard
          </a>
          <a
            href="#join-code"
            onClick={(e) => {
              e.preventDefault();
              setJoinModalOpen(true);
            }}
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Join Jam
          </a>
          <a
            href="#settings"
            onClick={(e) => {
              e.preventDefault();
              navigateToSettings();
            }}
            className={`flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              currentPage === 'settings' ? 'text-violet-600 dark:text-violet-400 font-bold' : ''
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings</span>
          </a>
          <a
            href="#admin"
            onClick={(e) => {
              e.preventDefault();
              navigateToAdmin();
            }}
            className={`flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              currentPage === 'admin' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-amber-600/80 dark:text-amber-400/80'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-500" />
            <span>Admin</span>
          </a>
          <a
            href="#account"
            onClick={(e) => {
              e.preventDefault();
              setAuthModalOpen(true);
            }}
            className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {user ? (
              <span className="flex items-center gap-1.5">
                <img
                  src={user.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(user.displayName || user.username || 'user')}`}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(user.displayName || user.username || 'user')}`;
                  }}
                  className="w-5 h-5 rounded-full object-cover border border-violet-500/40"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {user.displayName}
                </span>
                {user.isGuest ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Guest
                  </span>
                ) : user.authProvider === 'google' ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    Google
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400">
                    @{user.username}
                  </span>
                )}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600/15 to-blue-600/15 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                Sign In
              </span>
            )}
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </nav>

        {/* Zone 3: Header Actions (Mobile & Desktop) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick theme toggle on mobile */}
          <button
            type="button"
            onClick={toggleTheme}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Quick user avatar tap on mobile */}
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="md:hidden p-1 rounded-full border border-slate-200 dark:border-slate-700"
            aria-label="User Account"
          >
            {user ? (
              <img
                src={user.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(user.displayName || user.username || 'user')}`}
                alt={user.displayName}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-violet-500/15 text-violet-600 flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Create Jam</span>
            <span className="sm:hidden">Host</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 ${!activeRoomId ? 'pb-24 md:pb-8' : 'pb-6'}`}>
        {activeRoomId ? (
          <ErrorBoundary>
            <JamRoomView
              roomId={activeRoomId}
              currentUser={user}
              onLeaveRoom={leaveRoom}
            />
          </ErrorBoundary>
        ) : currentPage === 'settings' ? (
          <ErrorBoundary>
            <SettingsView
              onBackToDashboard={navigateToDashboard}
              onOpenAdminPortal={navigateToAdmin}
              onRefreshDashboard={loadDashboard}
            />
          </ErrorBoundary>
        ) : currentPage === 'admin' ? (
          <ErrorBoundary>
            <SuperAdminView
              onBackToDashboard={navigateToDashboard}
              onRefreshDashboard={loadDashboard}
            />
          </ErrorBoundary>
        ) : (
          <DashboardView
            user={user}
            rooms={rooms}
            myCreatedRooms={myCreatedRooms}
            recentlyJoinedRooms={recentlyJoinedRooms}
            userPlaylists={userPlaylists}
            friends={friends}
            allUsers={allUsers}
            history={history}
            onJoinRoom={enterRoom}
            onOpenCreateModal={() => setCreateModalOpen(true)}
            onOpenJoinModal={() => setJoinModalOpen(true)}
            onRefreshDashboard={loadDashboard}
          />
        )}
      </main>

      {/* Sleek Mobile Bottom Navigation Bar (Hidden when inside Jam Room) */}
      {!activeRoomId && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#090A0F]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 px-3 py-1.5 flex items-center justify-around shadow-2xl safe-area-pb"
        >
          <button
            type="button"
            onClick={navigateToDashboard}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all ${
              currentPage === 'dashboard'
                ? 'text-violet-600 dark:text-violet-400 font-bold scale-105'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">Live Jams</span>
          </button>

          <button
            type="button"
            onClick={() => setJoinModalOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <Hash className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">Join Code</span>
          </button>

          {/* Centered Floating + Host Button */}
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex flex-col items-center justify-center -mt-5 focus:outline-none group"
            title="Create and Host Jam Room"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 via-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/35 group-hover:scale-110 group-active:scale-95 transition-all">
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">Host</span>
          </button>

          <button
            type="button"
            onClick={navigateToSettings}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all ${
              currentPage === 'settings'
                ? 'text-violet-600 dark:text-violet-400 font-bold scale-105'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">Settings</span>
          </button>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            {user ? (
              <img
                src={user.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(user.displayName || user.username || 'user')}`}
                alt={user.displayName}
                className="w-5 h-5 rounded-full object-cover border border-violet-500/50"
              />
            ) : (
              <User className="w-5 h-5" />
            )}
            <span className="text-[10px] tracking-tight truncate max-w-[55px]">
              {user ? user.displayName.split(' ')[0] : 'Sign In'}
            </span>
          </button>
        </nav>
      )}

      {/* Quiet Footer */}
      <footer className="hidden md:block py-6 px-6 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>JamTogether — Synchronized Social Music Listening & WebRTC Voice Platform</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={navigateToSettings}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Settings
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={navigateToAdmin}
              className="text-amber-600 dark:text-amber-400 hover:underline transition-colors font-semibold flex items-center gap-1"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Super Admin Portal</span>
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Account
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CreateRoomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(room) => {
          loadDashboard();
          enterRoom(room.roomId);
        }}
      />

      <JoinRoomModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoined={(room) => {
          loadDashboard();
          enterRoom(room.roomId);
        }}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          loadDashboard();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <JamTogetherShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
