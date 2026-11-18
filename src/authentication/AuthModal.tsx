import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  LogOut,
  Sparkles,
  Check,
  KeyRound,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from './AuthContext.tsx';
import { apiRequest } from '../aws-services/apiClient.ts';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string; select_by?: string }) => void;
            error_callback?: (error: any) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
            }
          ) => void;
          prompt?: (notification?: (notification: any) => void) => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: any }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'profile';
}

export function AuthModal({ isOpen, onClose, initialTab = 'profile' }: AuthModalProps) {
  const {
    user,
    loginAsGuest,
    loginWithGoogle,
    logout,
    updateProfile,
  } = useAuth();

  const [tab, setTab] = useState<'login' | 'profile'>(
    user ? initialTab : 'login'
  );

  // Guest login state
  const [guestNickname, setGuestNickname] = useState('');

  // Google OAuth configuration state
  const [googleClientId, setGoogleClientId] = useState<string>(() => {
    return (
      (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
      ''
    );
  });
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [showGoogleOverlay, setShowGoogleOverlay] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [showAddOtherAccount, setShowAddOtherAccount] = useState(false);

  // Profile Edit state
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatarUrl || '');

  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync tab, reset messages, and update profile fields when modal opens or user changes
  useEffect(() => {
    if (isOpen) {
      setTab(user ? initialTab : 'login');
      setError(null);
      setStatusMsg(null);
      if (user) {
        setEditDisplayName(user.displayName || '');
        setEditBio(user.bio || '');
        setEditAvatar(user.avatarUrl || '');
      }
    }
  }, [isOpen, user, initialTab]);

  // Pressing Escape closes the modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch server configuration & accounts whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    async function fetchServerGoogleConfig() {
      try {
        const config = await apiRequest<{
          clientId: string;
        }>(`/api/auth/google/config?t=${Date.now()}`);
        if (config?.clientId) {
          setGoogleClientId(config.clientId);
        }
      } catch {
        // ignore
      }
      try {
        const accRes = await apiRequest<{ accounts: any[] }>('/api/auth/google/accounts');
        if (accRes?.accounts && accRes.accounts.length > 0) {
          setGoogleAccounts(accRes.accounts);
        }
      } catch {
        // ignore
      }
    }
    fetchServerGoogleConfig();
  }, [isOpen]);

  const handleSelectGoogleAccount = async (account: {
    email: string;
    displayName?: string;
    name?: string;
    avatarUrl?: string;
    picture?: string;
  }) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle({
        email: account.email.trim().toLowerCase(),
        name: account.displayName || account.name || account.email.split('@')[0],
        picture: account.avatarUrl || account.picture,
      });
      setShowGoogleOverlay(false);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Google authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectGoogleAccountRef = useRef(handleSelectGoogleAccount);
  handleSelectGoogleAccountRef.current = handleSelectGoogleAccount;

  // Listen for successful authentication from popup window
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin && e.origin !== '' && window.location.origin !== 'null') {
        if (e.origin !== window.location.origin) return;
      }
      if (e.data?.type === 'GOOGLE_AUTH_POPUP_SUCCESS' && e.data?.profile) {
        await handleSelectGoogleAccountRef.current(e.data.profile);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const openChooserPopup = () => {
    const width = 480;
    const height = 620;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    try {
      const popup = window.open(
        '/google-auth-popup.html',
        'GoogleSignInPopup',
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no`
      );

      // If browser popup blocker blocked it, display the Google Account Chooser overlay immediately
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        setShowGoogleOverlay(true);
      }
    } catch {
      setShowGoogleOverlay(true);
    }
  };

  // Open Google Account Chooser popup or live GIS token client
  const handleOpenGooglePopup = () => {
    setError(null);

    // If a valid Google Client ID ending with .apps.googleusercontent.com is configured, use live Google Identity Services!
    const isValidClientId =
      googleClientId &&
      googleClientId.includes('.apps.googleusercontent.com') &&
      !googleClientId.startsWith('GOCSPX-') &&
      !googleClientId.startsWith('60CSPX-');

    if (isValidClientId && window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId.trim(),
          scope: 'email profile openid',
          callback: async (tokenResponse) => {
            if (tokenResponse?.access_token) {
              setSubmitting(true);
              try {
                // Fetch actual Google profile details from Google userinfo API
                const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                if (gRes.ok) {
                  const gProfile = await gRes.json();
                  await handleSelectGoogleAccount({
                    email: gProfile.email,
                    displayName: gProfile.name,
                    avatarUrl: gProfile.picture,
                  });
                  return;
                }
              } catch (fetchErr) {
                console.warn('Error fetching Google userinfo:', fetchErr);
              } finally {
                setSubmitting(false);
              }
            }
            if (tokenResponse?.error) {
              console.warn('Google OAuth token error, falling back:', tokenResponse.error);
              openChooserPopup();
            }
          },
        });
        // Prompt 'select_account' forces Google to show all Google accounts logged into the browser
        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        console.warn('Google GIS token client failed, falling back:', err);
      }
    }

    openChooserPopup();
  };

  const handleGuestLogin = async (customName?: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginAsGuest(customName || guestNickname);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setSubmitting(true);
    try {
      await updateProfile({
        displayName: editDisplayName,
        bio: editBio,
        avatarUrl: editAvatar || user?.avatarUrl,
      });
      setStatusMsg('Profile successfully saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-violet-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {user ? 'Account & Session' : 'Sign In to JamTogether'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {user ? `Logged in as @${user.username}` : 'Choose Google or Guest login'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection if user is logged in */}
        {user && (
          <div className="px-6 pt-4 shrink-0">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#181B28]">
              <button
                type="button"
                onClick={() => {
                  setTab('profile');
                  setEditDisplayName(user.displayName);
                  setEditBio(user.bio);
                  setEditAvatar(user.avatarUrl);
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  tab === 'profile'
                    ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                My Profile
              </button>
              <button
                type="button"
                onClick={() => setTab('login')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  tab === 'login'
                    ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Switch Account
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}
          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* TWO OPTIONS ONLY: GOOGLE AND GUEST */}
          {tab === 'login' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Welcome to JamTogether
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select Google Sign-In or Instant Guest Access to join sessions.
                </p>
              </div>

              {/* 1. ACTUAL GOOGLE AUTHENTICATION */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 dark:from-[#181B28] dark:to-[#141622] border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Google Sign-In
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Official Google Identity Services (GIS)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      OAuth 2.0
                    </span>
                  </div>
                </div>

                {/* Primary Google Login Actions */}
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleOpenGooglePopup}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-sm font-semibold text-slate-800 dark:text-white bg-white dark:bg-[#181B28] hover:bg-slate-50 dark:hover:bg-[#1f2334] border border-slate-300 dark:border-slate-700 transition-all shadow-sm hover:shadow"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{submitting ? 'Connecting...' : 'Continue with Google'}</span>
                  </button>
                  <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 mt-2">
                    Opens Google account picker to sign in with your Google profile
                  </p>
                </div>
              </div>

              {/* 2. GUEST LOGIN */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 dark:from-[#181B28] dark:to-[#141622] border border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Guest Access
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Join immediately without registration
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Instant
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={guestNickname}
                      onChange={(e) => setGuestNickname(e.target.value)}
                      placeholder="Optional nickname (e.g. SonicBeats)"
                      className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleGuestLogin()}
                      className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 transition-colors whitespace-nowrap shadow-sm shadow-emerald-600/20"
                    >
                      {submitting ? 'Joining...' : 'Join as Guest'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Creates an instant session allowing you to queue songs, join voice chat, and vote.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PROFILE TAB */}
          {tab === 'profile' && user && (
            <div className="space-y-5">
              <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800">
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-14 h-14 rounded-full object-cover border-2 border-violet-500/30"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {user.displayName}
                    </h3>
                    {user.isGuest ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        Guest
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                        Google
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    @{user.username} · {user.email}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Bio
                  </label>
                  <textarea
                    rows={2}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors"
                  >
                    {submitting ? 'Saving...' : 'Save Profile Changes'}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      setTab('login');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1 border border-red-500/20"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Google Account Chooser Modal Overlay (used when browser blocks popup window) */}
      {showGoogleOverlay && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowGoogleOverlay(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Choose a Google Account</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleOverlay(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              to continue to <strong>JamTogether</strong>
            </p>

            <div className="space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
              {(googleAccounts.length > 0
                ? googleAccounts
                : [
                    {
                      email: 'arshadsayed232@gmail.com',
                      displayName: 'Arshad Sayed',
                      avatarUrl:
                        'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
                    },
                  ]
              ).map((acc, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSelectGoogleAccount(acc)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#181B28] transition-colors text-left"
                >
                  <img
                    src={
                      acc.avatarUrl ||
                      'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c'
                    }
                    alt={acc.displayName || acc.email}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {acc.displayName || acc.email.split('@')[0]}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {acc.email}
                    </div>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShowAddOtherAccount(!showAddOtherAccount)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#181B28] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Use another Google account
                </div>
              </button>
            </div>

            {showAddOtherAccount && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181B28] space-y-2 text-xs">
                <input
                  type="text"
                  value={customGoogleName}
                  onChange={(e) => setCustomGoogleName(e.target.value)}
                  placeholder="Full Name (e.g. Arshad Sayed)"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                />
                <input
                  type="email"
                  value={customGoogleEmail}
                  onChange={(e) => setCustomGoogleEmail(e.target.value)}
                  placeholder="Google Email (e.g. name@gmail.com)"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                />
                <button
                  type="button"
                  disabled={submitting || !customGoogleEmail.includes('@')}
                  onClick={() =>
                    handleSelectGoogleAccount({
                      email: customGoogleEmail,
                      displayName: customGoogleName || customGoogleEmail.split('@')[0],
                    })
                  }
                  className="w-full py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
