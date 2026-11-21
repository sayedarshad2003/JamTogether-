import React, { useEffect, useState } from 'react';
import {
  Shield,
  Key,
  Database,
  Users,
  Radio,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Lock,
  Unlock,
  Settings,
  Flame,
  Eye,
  EyeOff,
  Server,
  Activity,
  ListMusic,
  MessageSquare,
  History,
} from 'lucide-react';
import { apiRequest } from '../aws-services/apiClient.ts';

export interface AdminOverviewData {
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
    dynamoDb?: {
      isConfigured: boolean;
      tableName: string;
      region: string;
    };
  };
}

interface SuperAdminViewProps {
  onBackToDashboard: () => void;
  onRefreshDashboard?: () => Promise<void>;
}

export function SuperAdminView({ onBackToDashboard, onRefreshDashboard }: SuperAdminViewProps) {
  const [adminKey, setAdminKey] = useState<string>(() => {
    return sessionStorage.getItem('jamtogether_admin_key') || '';
  });
  const [adminPasskeyInput, setAdminPasskeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'rooms' | 'config' | 'wipe'>('overview');

  const [adminOverview, setAdminOverview] = useState<AdminOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Users & Records Inspector
  const [inspectedRecords, setInspectedRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [inspectedType, setInspectedType] = useState<string>('USER');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Google Config State
  const [adminGoogleClientId, setAdminGoogleClientId] = useState('');
  const [adminGoogleClientSecret, setAdminGoogleClientSecret] = useState('');
  const [savingGoogleConfig, setSavingGoogleConfig] = useState(false);

  // Data Wipe State
  const [wipeScope, setWipeScope] = useState<'history' | 'messages' | 'rooms' | 'all'>('all');
  const [wipeConfirmInput, setWipeConfirmInput] = useState('');
  const [wipingData, setWipingData] = useState(false);

  useEffect(() => {
    if (adminKey) {
      fetchAdminOverview(adminKey);
      fetchAdminRecords(adminKey, inspectedType);
    }
  }, [adminKey]);

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
      setAdminAuthError((err as Error).message || 'Invalid passkey. Access denied.');
    }
  };

  const handleAdminLogout = () => {
    setAdminKey('');
    sessionStorage.removeItem('jamtogether_admin_key');
    setAdminOverview(null);
    setInspectedRecords([]);
    setAdminMsg(null);
  };

  const fetchAdminOverview = async (key: string) => {
    setLoadingOverview(true);
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
      console.error('Failed to load admin overview:', err);
    } finally {
      setLoadingOverview(false);
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
      console.error('Failed to fetch records:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleSaveGoogleConfig = async (e: React.FormEvent) => {
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
      setAdminMsg({ type: 'success', text: res.message || 'Google OAuth configuration updated successfully.' });
      if (res.detectedSecretSwitch) {
        setAdminGoogleClientId('');
        setAdminGoogleClientSecret(res.clientSecret || '');
      }
      fetchAdminOverview(adminKey);
    } catch (err) {
      setAdminMsg({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingGoogleConfig(false);
    }
  };

  const handleExecuteWipe = async (scopeToWipe?: 'history' | 'messages' | 'rooms' | 'all') => {
    const targetScope = scopeToWipe || wipeScope;
    if (wipeConfirmInput.trim().toUpperCase() !== 'DELETE') {
      alert('Please type DELETE in capital letters to confirm this action.');
      return;
    }
    setWipingData(true);
    setAdminMsg(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string; deletedCount?: number }>('/api/admin/wipe', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
        body: JSON.stringify({ scope: targetScope, confirmText: 'DELETE' }),
      });
      setAdminMsg({
        type: 'success',
        text: res.message || `Data wipe for scope "${targetScope}" completed successfully.`,
      });
      setWipeConfirmInput('');
      await fetchAdminOverview(adminKey);
      await fetchAdminRecords(adminKey, inspectedType);
      if (onRefreshDashboard) await onRefreshDashboard();
    } catch (err) {
      setAdminMsg({ type: 'error', text: (err as Error).message });
    } finally {
      setWipingData(false);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    if (!window.confirm(`Force delete user account ${targetUserId}? This will remove all their playlists and history.`)) {
      return;
    }
    try {
      await apiRequest(`/api/admin/users/${targetUserId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      setAdminMsg({ type: 'success', text: `User ${targetUserId} deleted successfully.` });
      fetchAdminOverview(adminKey);
      fetchAdminRecords(adminKey, inspectedType);
    } catch (err) {
      setAdminMsg({ type: 'error', text: (err as Error).message });
    }
  };

  const handleDeleteRoom = async (targetRoomId: string) => {
    if (!window.confirm(`Force close and delete Jam Room ${targetRoomId}?`)) return;
    try {
      await apiRequest(`/api/rooms/${targetRoomId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      setAdminMsg({ type: 'success', text: `Room ${targetRoomId} deleted.` });
      fetchAdminOverview(adminKey);
      fetchAdminRecords(adminKey, inspectedType);
    } catch (err) {
      setAdminMsg({ type: 'error', text: (err as Error).message });
    }
  };

  /* =========================================================================
     1. LOCKED STATE (Passkey Authorization Form)
     ========================================================================= */
  if (!adminKey) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24 animate-in fade-in duration-300">
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Restricted
            </span>
          </div>

          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-blue-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-violet-500/20">
              <Shield className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Super Admin Portal</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter your master DevOps passkey to manage database tables, user accounts, and real-time sync.
            </p>
          </div>

          {adminAuthError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{adminAuthError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Master Security Passkey
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={adminPasskeyInput}
                  onChange={(e) => setAdminPasskeyInput(e.target.value)}
                  placeholder="Enter admin passkey..."
                  className="w-full pl-3.5 pr-10 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-md shadow-violet-500/20 flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>Unlock Admin Portal</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
              Default passkey: <span className="font-semibold text-violet-500">jamtogether_admin_2025</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     2. AUTHENTICATED SUPER ADMIN PORTAL
     ========================================================================= */
  const counts = adminOverview?.counts || {
    users: 0,
    rooms: 0,
    members: 0,
    queue: 0,
    messages: 0,
    history: 0,
    friendships: 0,
    playlists: 0,
    totalRecords: 0,
  };

  const filteredUsers = inspectedRecords.filter((r) => {
    if (inspectedType !== 'USER') return true;
    const q = userSearchTerm.toLowerCase();
    const data = r.data || {};
    return (
      (data.displayName || '').toLowerCase().includes(q) ||
      (data.username || '').toLowerCase().includes(q) ||
      (data.email || '').toLowerCase().includes(q) ||
      (data.userId || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Super Admin Navigation & Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-md shadow-violet-600/30">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Super Admin Portal</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Session
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enterprise management for Amazon DynamoDB, user identities, and real-time state.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              fetchAdminOverview(adminKey);
              fetchAdminRecords(adminKey, inspectedType);
            }}
            disabled={loadingOverview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#181B28] hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Refresh All Analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#181B28] hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>App Dashboard</span>
          </button>

          <button
            type="button"
            onClick={handleAdminLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
      {adminMsg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            adminMsg.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {adminMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            )}
            <span>{adminMsg.text}</span>
          </div>
          <button
            onClick={() => setAdminMsg(null)}
            className="font-bold underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Overview & Metrics</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('users');
            setInspectedType('USER');
            fetchAdminRecords(adminKey, 'USER');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'users'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts ({counts.users})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('rooms');
            setInspectedType('ROOM');
            fetchAdminRecords(adminKey, 'ROOM');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'rooms'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Jam Rooms & Queues ({counts.rooms})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'config'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Cloud Configuration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('wipe')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'wipe'
              ? 'bg-red-600 text-white shadow-sm shadow-red-500/30'
              : 'text-red-500 hover:text-red-600 hover:bg-red-500/10'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Danger Zone: Data Wipe</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-500" />
                <span>Total Users</span>
              </span>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{counts.users}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span>Active Rooms</span>
              </span>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{counts.rooms}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5 text-blue-500" />
                <span>Queued Songs</span>
              </span>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{counts.queue}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-pink-500" />
                <span>Chat Messages</span>
              </span>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{counts.messages}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-500" />
                <span>Songs History</span>
              </span>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{counts.history}</p>
            </div>
          </div>

          {/* Infrastructure Health Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-violet-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Amazon DynamoDB Health</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  CONNECTED
                </span>
              </div>
              <div className="space-y-2 text-xs font-mono text-slate-600 dark:text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Target Table:</span>
                  <span className="font-semibold text-violet-500">
                    {adminOverview?.system.dynamoDb?.tableName || 'JamTogether_CoreTable'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">AWS Region:</span>
                  <span>{adminOverview?.system.dynamoDb?.region || 'us-east-1'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Billing Mode:</span>
                  <span>PAY_PER_REQUEST (On-Demand)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Architecture:</span>
                  <span>Single-Table Design (PK/SK + GSI1)</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Runtime & Real-Time Sync</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  ONLINE
                </span>
              </div>
              <div className="space-y-2 text-xs font-mono text-slate-600 dark:text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Real-Time Engine:</span>
                  <span>MQTT Over WebSocket (EMQX Cloud Relay)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Voice Protocol:</span>
                  <span>WebRTC Mesh + STUN/TURN</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Google OAuth Config:</span>
                  <span>{adminOverview?.googleConfig?.isConfigured ? '✅ Active' : '⚠️ Pending Client ID'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">System Platform:</span>
                  <span>{adminOverview?.system.platform || 'cloud-amplify'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER ACCOUNTS INSPECTOR */}
      {activeTab === 'users' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Registered User Identities</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect all Google and guest user profiles recorded in DynamoDB.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search by name, email, or username..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white w-full sm:w-72"
            />
          </div>

          {loadingRecords ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading user accounts...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No users found matching your search.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredUsers.map((r, i) => {
                const u = r.data || {};
                return (
                  <div
                    key={r.PK + r.SK + i}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/80 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={
                          u.avatarUrl ||
                          `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                            u.displayName || u.username || 'user'
                          )}`
                        }
                        alt={u.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {u.displayName || u.username || 'Unnamed'}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            {u.authProvider || 'google'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          @{u.username} {u.email ? `· ${u.email}` : ''}
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 truncate">ID: {u.userId}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.userId)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-500/10 transition-colors shrink-0"
                      title="Force delete user account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: JAM ROOMS & QUEUES */}
      {activeTab === 'rooms' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in duration-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Active Jam Rooms</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live broadcasted rooms and their active participant rosters.
            </p>
          </div>

          {loadingRecords ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading rooms...</div>
          ) : inspectedRecords.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No active rooms found.</div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {inspectedRecords.map((r, i) => {
                const room = r.data || {};
                return (
                  <div
                    key={r.PK + r.SK + i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/80 dark:border-slate-800"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {room.name || 'Untitled Room'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400">
                          {room.roomCode}
                        </span>
                        {room.isPrivate && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Private
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        Host: {room.hostUsername} · {room.members?.length || 1} members · ID: {room.roomId}
                      </p>
                      {room.playback?.track?.title && (
                        <p className="text-[11px] text-violet-500 truncate">
                          Now Playing: {room.playback.track.title}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteRoom(room.roomId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors self-start sm:self-auto shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Terminate Room</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLOUD CONFIGURATION (GOOGLE OAUTH) */}
      {activeTab === 'config' && (
        <div className="max-w-2xl p-6 rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 space-y-5 animate-in fade-in duration-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Google OAuth 2.0 Credentials</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure Google OAuth Client ID and Secret for live sign-ins across all client devices.
            </p>
          </div>

          <form onSubmit={handleSaveGoogleConfig} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Google Web Client ID
              </label>
              <input
                type="text"
                value={adminGoogleClientId}
                onChange={(e) => setAdminGoogleClientId(e.target.value)}
                placeholder="e.g. 123456789-xxxx.apps.googleusercontent.com"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Google Client Secret (Optional for popup OAuth)
              </label>
              <input
                type="password"
                value={adminGoogleClientSecret}
                onChange={(e) => setAdminGoogleClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={savingGoogleConfig}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {savingGoogleConfig ? 'Saving...' : 'Save Google Credentials'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: DANGER ZONE - COMPLETE DATA WIPE & FACTORY RESET */}
      {activeTab === 'wipe' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-6 rounded-3xl bg-red-500/5 dark:bg-red-500/10 border-2 border-red-500/30 space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-red-600 dark:text-red-400">
                  Super Admin Danger Zone: Data Wipe & Scratch Reset
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Select a targeted wipe scope or perform a 100% complete factory reset.
                  Once executed, data is permanently erased from Amazon DynamoDB.
                </p>
              </div>
            </div>

            {/* Scope Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setWipeScope('history')}
                className={`p-4 rounded-2xl border text-left space-y-1 transition-all ${
                  wipeScope === 'history'
                    ? 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11131C] opacity-80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Wipe History Only</span>
                </div>
                <p className="text-[11px] text-slate-500">Deletes song listening logs across all users.</p>
              </button>

              <button
                type="button"
                onClick={() => setWipeScope('messages')}
                className={`p-4 rounded-2xl border text-left space-y-1 transition-all ${
                  wipeScope === 'messages'
                    ? 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11131C] opacity-80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-pink-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Wipe Messages Only</span>
                </div>
                <p className="text-[11px] text-slate-500">Purges all room chats and reactions.</p>
              </button>

              <button
                type="button"
                onClick={() => setWipeScope('rooms')}
                className={`p-4 rounded-2xl border text-left space-y-1 transition-all ${
                  wipeScope === 'rooms'
                    ? 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11131C] opacity-80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Wipe Rooms & Queues</span>
                </div>
                <p className="text-[11px] text-slate-500">Closes all rooms and resets queue items.</p>
              </button>

              <button
                type="button"
                onClick={() => setWipeScope('all')}
                className={`p-4 rounded-2xl border text-left space-y-1 transition-all ${
                  wipeScope === 'all'
                    ? 'border-red-500 bg-red-500/15 ring-2 ring-red-500/40 shadow-lg shadow-red-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11131C] opacity-80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">🔥 Full Factory Reset</span>
                </div>
                <p className="text-[11px] text-slate-500">Wipes all tables, users, rooms, and state to scratch.</p>
              </button>
            </div>

            {/* Confirmation Input and Execute Button */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#11131C] border border-red-500/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Target: <span className="uppercase text-red-600 font-mono">{wipeScope}</span>
                  </span>
                  <p className="text-xs text-slate-500">
                    Type <span className="font-mono font-bold text-red-600">DELETE</span> in capital letters to confirm:
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={wipeConfirmInput}
                    onChange={(e) => setWipeConfirmInput(e.target.value)}
                    placeholder="Type DELETE..."
                    className="px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-red-500/50 text-slate-900 dark:text-white font-mono w-40 text-center uppercase"
                  />

                  <button
                    type="button"
                    disabled={wipeConfirmInput.trim().toUpperCase() !== 'DELETE' || wipingData}
                    onClick={() => handleExecuteWipe()}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-red-600/30 whitespace-nowrap"
                  >
                    {wipingData ? 'Wiping Database...' : 'Execute Permanent Wipe'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
