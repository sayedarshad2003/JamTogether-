/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { ThemeProvider, useTheme } from './themes/ThemeContext.tsx';
import { AuthProvider, useAuth } from './authentication/AuthContext.tsx';
import { AuthModal } from './authentication/AuthModal.tsx';
import { DashboardView } from './dashboard/DashboardView.tsx';
import { JamRoomView } from './rooms/JamRoomView.tsx';
import { SettingsView } from './settings/SettingsView.tsx';
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

  const [currentPage, setCurrentPage] = useState<'dashboard' | 'settings'>('dashboard');

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
    const unsub = globalRoomDiscovery.subscribe((discoveredRooms) => {
      if (discoveredRooms && discoveredRooms.length > 0) {
        setRooms((prev) => {
          const roomMap = new Map<string, JamRoom>();
          prev.forEach((r) => roomMap.set(r.roomId, r));
          discoveredRooms.forEach((r) => {
            if (!r.isPrivate && !roomMap.has(r.roomId)) {
              roomMap.set(r.roomId, r);
            }
          });
          return Array.from(roomMap.values());
        });
      }
    });
    return unsub;
  }, []);

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
  };

  const navigateToSettings = () => {
    leaveRoom();
    setCurrentPage('settings');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 py-4 bg-white/90 dark:bg-[#090A0F]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateToDashboard();
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          JamTogether
        </a>

        {/* Zone 2: Navigation Links */}
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
                  src={user.avatarUrl}
                  alt={user.displayName}
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
                Sign In (Guest / Google)
              </span>
            )}
          </a>
          <a
            href="#theme"
            onClick={(e) => {
              e.preventDefault();
              toggleTheme();
            }}
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all whitespace-nowrap shrink-0"
          >
            Create Jam
          </button>
        </div>
      </header>

      {/* Mobile Secondary Utility Strip for narrow viewports */}
      <div className="flex md:hidden items-center justify-between px-4 py-2 bg-white dark:bg-[#11131C] border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 overflow-x-auto gap-4">
        <button onClick={navigateToDashboard} className="whitespace-nowrap">
          Dashboard
        </button>
        <button onClick={() => setJoinModalOpen(true)} className="whitespace-nowrap">
          Join Code
        </button>
        <button onClick={navigateToSettings} className="whitespace-nowrap font-bold text-violet-600 dark:text-violet-400">
          Settings
        </button>
        <button onClick={() => setAuthModalOpen(true)} className="whitespace-nowrap">
          {user ? `@${user.username}` : 'Account'}
        </button>
        <button onClick={toggleTheme} className="whitespace-nowrap">
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1">
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

      {/* Quiet Footer */}
      <footer className="py-6 px-6 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>JamTogether — Synchronized Social Music Listening & WebRTC Voice Platform</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={navigateToSettings}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Settings & Super Admin
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
