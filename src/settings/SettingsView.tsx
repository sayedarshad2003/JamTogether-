import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  KeyRound,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Moon,
  Sun,
  Sliders,
  Volume2,
  User,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  ArrowLeft,
  AlertCircle,
  Database,
  Users,
  Radio,
  Clock,
  ListMusic,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile } from '../types/jam.ts';
import { useAuth } from '../authentication/AuthContext.tsx';
import { useTheme } from '../themes/ThemeContext.tsx';
import { apiRequest } from '../aws-services/apiClient.ts';

interface SettingsViewProps {
  onBackToDashboard: () => void;
  onRefreshDashboard?: () => Promise<void>;
}

interface AdminOverviewData {
  counts: {
    users: number;
    rooms: number;
    members: number;
    queue: number;
    messages: number;
    history: number;
    friendships: number;
    playlists: number;
    totalRecords: number;
  };
  googleConfig: {
    clientId: string;
    clientSecret?: string;
    isConfigured: boolean;
    isSecretEnteredAsId?: boolean;
  };
  system: {
    nodeVersion: string;
    platform: string;
    uptimeSec: number;
    memoryUsageMb: number;
    excelFilePath: string;
    excelStats: {
      exists: boolean;
      sizeBytes: number;
      sizeFormatted: string;
      sheetNames: string[];
    };
  };
}

export function SettingsView({ onBackToDashboard, onRefreshDashboard }: SettingsViewProps) {
  const { user, updateProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'general' | 'account' | 'privacy' | 'admin'>('general');

  // General Settings State
  const [defaultVolume, setDefaultVolume] = useState<number>(() => {
    return Number(localStorage.getItem('jamtogether_volume') || 80);
  });
  const [syncBufferSec, setSyncBufferSec] = useState<number>(() => {
    return Number(localStorage.getItem('jamtogether_sync_buffer') || 1.2);
  });
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(() => {
    return localStorage.getItem('jamtogether_autoplay') !== 'false';
  });

  // Account Form State
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [favoriteGenres, setFavoriteGenres] = useState(user?.favoriteGenres?.join(', ') || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Privacy / Self-Service State
  const [clearingData, setClearingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);

  // Super Admin State
  const [adminKey, setAdminKey] = useState<string>(() => {
    return sessionStorage.getItem('jamtogether_admin_key') || '';
  });
  const [adminPasskeyInput, setAdminPasskeyInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [adminOverview, setAdminOverview] = useState<AdminOverviewData | null>(null);
  const [loadingAdminOverview, setLoadingAdminOverview] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  // Admin Google Config State
  const [adminGoogleClientId, setAdminGoogleClientId] = useState('');
  const [adminGoogleClientSecret, setAdminGoogleClientSecret] = useState('');
  const [savingGoogleConfig, setSavingGoogleConfig] = useState(false);

  // Admin Records & Users Inspector
  const [inspectedRecords, setInspectedRecords] = useState<any[]>([]);
  const [inspectedType, setInspectedType] = useState<string>('USER');
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Admin Data Wipe State
  const [wipeScope, setWipeScope] = useState<'history' | 'messages' | 'rooms' | 'all'>('history');
  const [wipeConfirmInput, setWipeConfirmInput] = useState('');
  const [wipingData, setWipingData] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || '');
      setFavoriteGenres(user.favoriteGenres?.join(', ') || '');
    }
  }, [user]);

  // Load Admin Data if already authorized
  useEffect(() => {
    if (adminKey && activeTab === 'admin') {
      fetchAdminOverview(adminKey);
      fetchAdminRecords(adminKey, inspectedType);
    }
  }, [adminKey, activeTab]);

  const handleSaveGeneral = () => {
    localStorage.setItem('jamtogether_volume', String(defaultVolume));
    localStorage.setItem('jamtogether_sync_buffer', String(syncBufferSec));
    localStorage.setItem('jamtogether_autoplay', String(autoPlayNext));
    setProfileMsg('Playback preferences updated.');
    setTimeout(() => setProfileMsg(null), 3000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const genresArray = favoriteGenres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      await updateProfile({
        displayName,
        bio,
        avatarUrl,
        favoriteGenres: genresArray,
      });
      setProfileMsg('Profile successfully updated.');
      if (onRefreshDashboard) await onRefreshDashboard();
    } catch (err) {
      setProfileMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleClearMyData = async () => {
    if (!window.confirm('Are you sure you want to delete all your listening history and personal playlists? Your account will remain active.')) {
      return;
    }
    setClearingData(true);
    setPrivacyMsg(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/user/delete-data', {
        method: 'POST',
      });
      setPrivacyMsg(res.message);
      if (onRefreshDashboard) await onRefreshDashboard();
    } catch (err) {
      setPrivacyMsg(`Error: ${(err as Error).message}`);
    } finally {
      setClearingData(false);
    }
  };

  const handleDeleteMyAccount = async () => {
    const confirmation = window.prompt(
      'WARNING: This will permanently delete your account, session, playlists, and listening history.\nType "DELETE" to confirm:'
    );
    if (confirmation !== 'DELETE') {
      return;
    }
    setDeletingAccount(true);
    try {
      await apiRequest('/api/user/me', { method: 'DELETE' });
      await logout();
      onBackToDashboard();
    } catch (err) {
      alert((err as Error).message);
      setDeletingAccount(false);
    }
  };

  // Super Admin Methods
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError(null);
    try {
      const res = await apiRequest<{ success: boolean; adminKey: string }>('/api/admin/verify', {
        method: 'POST',
        body: JSON.stringify({ passkey: adminPasskeyInput.trim() }),
      });
      setAdminKey(res.adminKey);
      sessionStorage.setItem('jamtogether_admin_key', res.adminKey);
      fetchAdminOverview(res.adminKey);
      fetchAdminRecords(res.adminKey, inspectedType);
    } catch (err) {
      setAdminAuthError((err as Error).message || 'Invalid passkey.');
    }
  };

  const handleAdminLogout = () => {
    setAdminKey('');
    sessionStorage.removeItem('jamtogether_admin_key');
    setAdminOverview(null);
    setInspectedRecords([]);
  };

  const fetchAdminOverview = async (key: string) => {
    setLoadingAdminOverview(true);
    try {
      const data = await apiRequest<AdminOverviewData>('/api/admin/overview', {
        headers: { 'x-admin-key': key },
      });
      if (data) {
        setAdminOverview(data);
        if (data.googleConfig) {
          setAdminGoogleClientId(data.googleConfig.clientId || '');
          setAdminGoogleClientSecret(data.googleConfig.clientSecret || '');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAdminOverview(false);
    }
  };

  const fetchAdminRecords = async (key: string, type: string) => {
    setLoadingRecords(true);
    try {
      const data = await apiRequest<{ records: any[] }>(`/api/admin/records?type=${type}`, {
        headers: { 'x-admin-key': key },
      });
      setInspectedRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleSaveGoogleClientId = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoogleConfig(true);
    setAdminMsg(null);
    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        clientId: string;
        clientSecret: string;
        detectedSecretSwitch?: boolean;
      }>('/api/admin/config/google', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
        body: JSON.stringify({
          clientId: adminGoogleClientId.trim(),
          clientSecret: adminGoogleClientSecret.trim(),
        }),
      });
      setAdminMsg(res.message);
      if (res.detectedSecretSwitch) {
        setAdminGoogleClientId('');
        setAdminGoogleClientSecret(res.clientSecret || '');
      }
      fetchAdminOverview(adminKey);
    } catch (err) {
      setAdminMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSavingGoogleConfig(false);
    }
  };

  const handleSyncExcel = async () => {
    setAdminMsg(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/sync-excel', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      });
      setAdminMsg(res.message);
      fetchAdminOverview(adminKey);
    } catch (err) {
      setAdminMsg(`Error: ${(err as Error).message}`);
    }
  };

  const handleWipeData = async () => {
    if (wipeConfirmInput.trim() !== 'DELETE') {
      alert('Please type DELETE in capital letters to confirm this action.');
      return;
    }
    setWipingData(true);
    setAdminMsg(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/wipe', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
        body: JSON.stringify({ scope: wipeScope, confirmText: 'DELETE' }),
      });
      setAdminMsg(res.message);
      setWipeConfirmInput('');
      fetchAdminOverview(adminKey);
      fetchAdminRecords(adminKey, inspectedType);
      if (onRefreshDashboard) await onRefreshDashboard();
    } catch (err) {
      setAdminMsg(`Error: ${(err as Error).message}`);
    } finally {
      setWipingData(false);
    }
  };

  const handleDeleteUserByAdmin = async (targetUserId: string) => {
    if (!window.confirm(`Force delete user ${targetUserId}?`)) return;
    try {
      await apiRequest(`/api/admin/users/${targetUserId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      fetchAdminOverview(adminKey);
      fetchAdminRecords(adminKey, inspectedType);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="p-2 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 hover:border-violet-500 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              <span>Platform Settings & Administration</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage appearance, playback preferences, account data, and Super Admin controls
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity"
        >
          <span>Return to Jam</span>
        </button>
      </div>

      {/* Main Grid: Sidebar Tabs + Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Navigation Sidebar (3 cols) */}
        <div className="md:col-span-3 space-y-1 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
              activeTab === 'general'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0" />
            <span>Theme & Playback</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
              activeTab === 'account'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span>Profile & Account</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
              activeTab === 'privacy'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Data Privacy & Delete</span>
          </button>

          <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                activeTab === 'admin'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 shrink-0" />
                <span>Super Admin</span>
              </div>
              {adminKey ? (
                <Unlock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 shrink-0 opacity-70" />
              )}
            </button>
          </div>
        </div>

        {/* Content Panel (9 cols) */}
        <div className="md:col-span-9 space-y-6">
          {/* TAB 1: THEME & PLAYBACK */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Theme Settings */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Interface Theme
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select your preferred visual style across all jam rooms and controls
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== 'dark') toggleTheme();
                    }}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                      theme === 'dark'
                        ? 'bg-[#181B28] border-violet-500 shadow-sm text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
                      <Moon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Dark Studio Lounge</p>
                      <p className="text-[11px] text-slate-400">High contrast studio aesthetic</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== 'light') toggleTheme();
                    }}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                      theme === 'light'
                        ? 'bg-violet-50 border-violet-500 shadow-sm text-slate-900'
                        : 'bg-slate-50 dark:bg-[#181B28] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                      <Sun className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Light Workspace</p>
                      <p className="text-[11px] text-slate-500">Bright and crisp daytime mode</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Playback & Audio Preferences */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-violet-500" />
                    <span>Playback & Sync Buffer</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Customize default listening volume and synchronization buffer
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>Default Volume Level</span>
                      <span className="font-mono">{defaultVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={defaultVolume}
                      onChange={(e) => setDefaultVolume(Number(e.target.value))}
                      className="w-full accent-violet-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>Sync Check Latency Tolerance</span>
                      <span className="font-mono">{syncBufferSec}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="3.0"
                      step="0.1"
                      value={syncBufferSec}
                      onChange={(e) => setSyncBufferSec(Number(e.target.value))}
                      className="w-full accent-violet-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Lower values enforce tighter lockstep synchronization; higher values prevent frequent seeks on variable connections.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Auto-play Next Track in Queue
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Automatically advance to the next song when current track finishes
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoPlayNext}
                      onChange={(e) => setAutoPlayNext(e.target.checked)}
                      className="w-4 h-4 accent-violet-600 rounded cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveGeneral}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all"
                  >
                    Save Preferences
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROFILE & ACCOUNT */}
          {activeTab === 'account' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  User Profile Information
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update your public identity visible to listeners in Jam Rooms
                </p>
              </div>

              {profileMsg && (
                <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-600 dark:text-violet-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{profileMsg}</span>
                </div>
              )}

              {user ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800">
                    <img
                      src={avatarUrl || user.avatarUrl}
                      alt={displayName}
                      className="w-14 h-14 rounded-full object-cover border-2 border-violet-500/40"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {displayName || user.displayName}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400">
                          {user.authProvider === 'google' ? 'Google Account' : 'Guest Session'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        @{user.username} · {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Avatar Image URL
                      </label>
                      <input
                        type="text"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Bio
                    </label>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Favorite Genres (comma separated)
                    </label>
                    <input
                      type="text"
                      value={favoriteGenres}
                      onChange={(e) => setFavoriteGenres(e.target.value)}
                      placeholder="Indie, Lo-Fi, Electronic, Pop"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-5 py-2 text-xs font-semibold rounded-xl text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all"
                    >
                      {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  Please sign in to view and customize your account profile.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATA PRIVACY & DELETE */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-amber-500" />
                    <span>Clear My Available Data</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Remove your song listening history and saved personal playlists while keeping your account login active.
                  </p>
                </div>

                {privacyMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{privacyMsg}</span>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
                  <p className="text-amber-800 dark:text-amber-300 font-semibold">
                    What will be cleared:
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-amber-700 dark:text-amber-400 space-y-1">
                    <li>All your song listening history across Jam Rooms</li>
                    <li>All your user-wise saved YouTube playlists</li>
                  </ul>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={clearingData}
                    onClick={handleClearMyData}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all"
                  >
                    {clearingData ? 'Clearing Data...' : 'Clear My Song History & Playlists'}
                  </button>
                </div>
              </div>

              {/* Danger Zone: Delete Account */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-red-500/30 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span>Danger Zone: Delete My Account</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Permanently delete your user profile, active sessions, and linked data from JamTogether
                  </p>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  This action is irreversible. All your sessions, friend links, rooms, playlists, and user records in the Excel database will be wiped permanently.
                </p>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={handleDeleteMyAccount}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-red-600 hover:bg-red-500 shadow-md shadow-red-600/20 transition-all"
                  >
                    {deletingAccount ? 'Deleting Account...' : 'Delete My Account Permanently'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SUPER ADMIN PORTAL */}
          {activeTab === 'admin' && (
            <div className="space-y-6">
              {/* Not Logged In as Super Admin */}
              {!adminKey ? (
                <div className="p-8 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-6 max-w-md mx-auto text-center shadow-lg">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center mx-auto shadow-md shadow-orange-500/30">
                    <Shield className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Super Admin Authentication
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Enter the Super Admin Passkey to control Excel database exports, manage Google Auth keys, and access data reset tools.
                    </p>
                  </div>

                  {adminAuthError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{adminAuthError}</span>
                    </div>
                  )}

                  <form onSubmit={handleAdminLogin} className="space-y-3">
                    <input
                      type="password"
                      required
                      value={adminPasskeyInput}
                      onChange={(e) => setAdminPasskeyInput(e.target.value)}
                      placeholder="Enter Admin Passkey..."
                      className="w-full px-3 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-md transition-all"
                    >
                      Unlock Super Admin Portal
                    </button>
                    <p className="text-[10px] text-slate-400 italic">
                      Configured in .env via <code>ADMIN_SECRET</code> (default: <code>admin123</code>)
                    </p>
                  </form>
                </div>
              ) : (
                /* Logged In Super Admin Dashboard */
                <div className="space-y-6">
                  {/* Admin Header Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border border-amber-500/20">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Super Admin Control Center
                        </h2>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Full system administration, database exports, and Google OAuth credentials
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          fetchAdminOverview(adminKey);
                          fetchAdminRecords(adminKey, inspectedType);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAdminLogout}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                      >
                        Lock Admin
                      </button>
                    </div>
                  </div>

                  {adminMsg && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{adminMsg}</span>
                    </div>
                  )}

                  {/* 1. Statistics Cards */}
                  {adminOverview?.counts && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="text-xs">Users</span>
                          <Users className="w-4 h-4 text-blue-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">
                          {adminOverview.counts.users ?? 0}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="text-xs">Jam Rooms</span>
                          <Radio className="w-4 h-4 text-violet-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">
                          {adminOverview.counts.rooms ?? 0}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="text-xs">Saved Playlists</span>
                          <ListMusic className="w-4 h-4 text-emerald-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">
                          {adminOverview.counts.playlists ?? 0}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="text-xs">Total Records</span>
                          <Database className="w-4 h-4 text-amber-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">
                          {adminOverview.counts.totalRecords ?? 0}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. EXCEL DATABASE CONTROL */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Excel Database Management (.xlsx)
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Persistent file-based database stored at <code>data/jamtogether_database.xlsx</code>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSyncExcel}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#181B28] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Force Sync to Excel</span>
                        </button>

                        <a
                          href={`/api/database/excel?key=${encodeURIComponent(adminKey)}`}
                          download="jamtogether_database.xlsx"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download .xlsx</span>
                        </a>
                      </div>
                    </div>

                    {adminOverview?.system?.excelStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#181B28]">
                          <span className="text-[10px] text-slate-400 block">Status</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active & Synced</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#181B28]">
                          <span className="text-[10px] text-slate-400 block">File Size</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                            {adminOverview.system.excelStats.sizeFormatted || '15.1 KB'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#181B28] sm:col-span-2">
                          <span className="text-[10px] text-slate-400 block">Sheets (9 Total)</span>
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate block">
                            {adminOverview.system.excelStats.sheetNames?.join(', ') || 'Users, JamRooms, Playlists'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. MANAGE GOOGLE AUTH CLIENT KEY */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              Google OAuth 2.0 Credentials
                            </h3>
                            {adminOverview?.googleConfig?.isConfigured ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                Active for All Users (Global)
                              </span>
                            ) : adminOverview?.googleConfig?.isSecretEnteredAsId ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Secret Saved — Client ID Needed
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                                Not Configured
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Configure Google Cloud Client ID & Secret for live Google authentication
                          </p>
                        </div>
                      </div>
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        Google Console <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Detection notice if client secret was pasted into client id */}
                    {(adminGoogleClientId.startsWith('GOCSPX-') || adminOverview?.googleConfig?.isSecretEnteredAsId) && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5 text-amber-800 dark:text-amber-300">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Google Client Secret Detected ('GOCSPX-...')</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          The key starting with <code>GOCSPX-</code> is a <strong>Google Client Secret</strong>, which Google rejects with <code>Error 401: invalid_client</code> when used as a Client ID.
                          Google requires the <strong>Client ID</strong> (ends with <code>.apps.googleusercontent.com</code>) located right above the secret in Google Cloud Console.
                        </p>
                      </div>
                    )}

                    <form onSubmit={handleSaveGoogleClientId} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span>1. Google OAuth 2.0 Client ID (Required for Google Sign-In)</span>
                          <span className="text-[10px] text-slate-400 font-normal">Ends with .apps.googleusercontent.com</span>
                        </label>
                        <input
                          type="text"
                          value={adminGoogleClientId}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.trim().startsWith('GOCSPX-')) {
                              setAdminGoogleClientSecret(val.trim());
                              setAdminGoogleClientId('');
                              setAdminMsg("Notice: Pasted key is a Client Secret (starts with 'GOCSPX-'). Automatically placed into Client Secret field below. Please copy your Client ID from Google Cloud Console.");
                            } else {
                              setAdminGoogleClientId(val);
                            }
                          }}
                          placeholder="e.g. YOUR_CLIENT_ID.apps.googleusercontent.com"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span>2. Google OAuth 2.0 Client Secret</span>
                          <span className="text-[10px] text-slate-400 font-normal">Starts with GOCSPX-</span>
                        </label>
                        <input
                          type="text"
                          value={adminGoogleClientSecret}
                          onChange={(e) => setAdminGoogleClientSecret(e.target.value)}
                          placeholder="e.g. GOCSPX-your_client_secret_here"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Helper guide */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Required Google Cloud OAuth Settings:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 font-mono text-[10px]">
                          <div>Authorized JavaScript origins: <code className="text-blue-600 dark:text-blue-400">http://localhost:3000</code></div>
                          <div>Authorized redirect URIs: <code className="text-blue-600 dark:text-blue-400">http://localhost:3000</code></div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-[11px] text-slate-500">
                          Saves directly to server environment and <code>.env</code> file.
                        </span>
                        <button
                          type="submit"
                          disabled={savingGoogleConfig}
                          className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-500 shadow-sm transition-all"
                        >
                          {savingGoogleConfig ? 'Saving...' : 'Update Google Credentials'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* 4. RECORDS & USERS EXPLORER */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Live Database Records Inspector
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Inspect records across DynamoDB and Excel sheets
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={inspectedType}
                          onChange={(e) => {
                            setInspectedType(e.target.value);
                            fetchAdminRecords(adminKey, e.target.value);
                          }}
                          className="px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="USER">Users</option>
                          <option value="ROOM">JamRooms</option>
                          <option value="PLAYLIST">UserPlaylists</option>
                          <option value="HISTORY">ListeningHistory</option>
                          <option value="QUEUE">MusicQueue</option>
                          <option value="MESSAGE">ChatMessages</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 max-h-64 overflow-y-auto space-y-2 text-xs">
                      {loadingRecords && (
                        <div className="py-6 text-center text-slate-400">Loading records...</div>
                      )}
                      {!loadingRecords && inspectedRecords.length === 0 && (
                        <div className="py-6 text-center text-slate-400">No records found for {inspectedType}.</div>
                      )}
                      {!loadingRecords &&
                        inspectedRecords.map((r, i) => (
                          <div
                            key={r.PK + r.SK + i}
                            className="p-2.5 rounded-lg bg-white dark:bg-[#11131C] border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1 font-mono text-[11px]">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {r.data?.displayName || r.data?.name || r.data?.title || r.PK}
                              </p>
                              <p className="text-slate-500 text-[10px] truncate">
                                PK: {r.PK} | SK: {r.SK}
                              </p>
                            </div>
                            {r.entityType === 'USER' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUserByAdmin(r.data?.userId)}
                                className="p-1 rounded text-red-500 hover:bg-red-500/10 text-xs"
                                title="Force delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 5. SUPER ADMIN DANGER ZONE: DATA WIPE & RESET */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-[#11131C] border-2 border-red-500/30 space-y-4 shadow-sm">
                    <div>
                      <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span>Super Admin Data Wipe & Scratch Reset</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Select a scope to wipe specific records or perform a complete factory reset to clean scratch.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Wipe Target Scope
                        </label>
                        <select
                          value={wipeScope}
                          onChange={(e: any) => setWipeScope(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="history">Wipe All Songs History Only</option>
                          <option value="messages">Wipe All Chat Messages Only</option>
                          <option value="rooms">Wipe All Jam Rooms & Queues</option>
                          <option value="all">🔥 COMPLETE DATA RESET TO SCRATCH (All Tables)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Confirmation: Type <span className="font-mono text-red-600">DELETE</span>
                        </label>
                        <input
                          type="text"
                          value={wipeConfirmInput}
                          onChange={(e) => setWipeConfirmInput(e.target.value)}
                          placeholder="Type DELETE..."
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-red-500/40 text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        disabled={wipingData || wipeConfirmInput.trim() !== 'DELETE'}
                        onClick={handleWipeData}
                        className={`px-5 py-2 text-xs font-bold rounded-xl text-white transition-all shadow-md ${
                          wipeConfirmInput.trim() === 'DELETE'
                            ? 'bg-red-600 hover:bg-red-500 cursor-pointer shadow-red-600/30'
                            : 'bg-slate-400 dark:bg-slate-700 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {wipingData ? 'Processing Wipe...' : 'Execute Data Wipe'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
