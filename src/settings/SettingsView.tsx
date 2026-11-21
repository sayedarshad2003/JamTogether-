import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Trash2,
  AlertTriangle,
  Moon,
  Sun,
  Sliders,
  Volume2,
  User,
  Check,
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
  Upload,
  Camera,
} from 'lucide-react';
import { useAuth } from '../authentication/AuthContext.tsx';
import { useTheme } from '../themes/ThemeContext.tsx';
import { apiRequest } from '../aws-services/apiClient.ts';
import { compressAvatarImage } from '../utils/imageCompressor.ts';

interface SettingsViewProps {
  onBackToDashboard: () => void;
  onOpenAdminPortal?: () => void;
  onRefreshDashboard?: () => Promise<void>;
}

export function SettingsView({ onBackToDashboard, onOpenAdminPortal, onRefreshDashboard }: SettingsViewProps) {
  const { user, updateProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'general' | 'account' | 'privacy'>('general');

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

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || '');
      setFavoriteGenres(user.favoriteGenres?.join(', ') || '');
    }
  }, [user]);

  const handleSaveGeneral = () => {
    localStorage.setItem('jamtogether_volume', String(defaultVolume));
    localStorage.setItem('jamtogether_sync_buffer', String(syncBufferSec));
    localStorage.setItem('jamtogether_autoplay', String(autoPlayNext));
    setProfileMsg('Playback preferences updated.');
    setTimeout(() => setProfileMsg(null), 3000);
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }
    try {
      setProfileMsg('Optimizing image...');
      const compressed = await compressAvatarImage(file, 180, 0.85);
      if (compressed) {
        setAvatarUrl(compressed);
        setProfileMsg('Photo selected! Click "Save Profile Changes" to update.');
      }
    } catch {
      alert('Failed to process image file.');
    }
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
      let finalAvatar = avatarUrl;
      if (finalAvatar && finalAvatar.startsWith('data:image/')) {
        finalAvatar = await compressAvatarImage(finalAvatar, 180, 0.85);
      }
      await updateProfile({
        displayName,
        bio,
        avatarUrl: finalAvatar,
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
              <span>Platform Settings</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage appearance, playback preferences, and personal account privacy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAdminPortal && (
            <button
              type="button"
              onClick={onOpenAdminPortal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all shadow-sm"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Super Admin Portal</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            <span>Return to Jam</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar Tabs + Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Navigation Sidebar (3 cols) */}
        <div className="md:col-span-3 space-y-1 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${activeTab === 'general'
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
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${activeTab === 'account'
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
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${activeTab === 'privacy'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Data Privacy & Delete</span>
          </button>

          {onOpenAdminPortal && (
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onOpenAdminPortal}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-500/20"
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Super Admin Portal</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
              </button>
            </div>
          )}
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
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${theme === 'dark'
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
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${theme === 'light'
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
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative">
                        <img
                          src={avatarUrl || user.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(displayName || user.displayName || 'user')}`}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(displayName || user.displayName || 'user')}`;
                          }}
                          className="w-16 h-16 rounded-full object-cover border-2 border-violet-500/40 shadow-sm"
                        />
                      </div>
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

                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-sm">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarFileUpload}
                        />
                      </label>
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
                  This action is irreversible. All your sessions, friend links, rooms, playlists, and user records in DynamoDB will be wiped permanently.
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

              {/* Super Admin Notice Card */}
              {onOpenAdminPortal && (
                <div className="p-6 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Super Admin Control Center
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Need platform-wide database wipes, DynamoDB metrics, or Google OAuth keys?
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onOpenAdminPortal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-sm transition-all"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Open Super Admin Portal</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
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
