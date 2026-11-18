import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Search,
  Plus,
  Play,
  Check,
  Youtube,
  ListPlus,
  Music,
  Loader2,
  Sparkles,
  ExternalLink,
  ListMusic,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { YouTubeTrack, UserPlaylist } from '../types/jam.ts';
import { apiRequest } from '../aws-services/apiClient.ts';

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  initialTab?: 'search' | 'playlist' | 'my-playlists';
  onAddTrack: (track: YouTubeTrack) => Promise<void>;
  onPlayNow: (track: YouTubeTrack) => Promise<void>;
  onAddPlaylist?: (playlistUrl: string, tracks?: YouTubeTrack[], playlistName?: string) => Promise<void>;
  onQueueUserPlaylist?: (playlistId: string) => Promise<void>;
}

const PRESET_PLAYLISTS = [
  {
    name: 'Top Pop & Timeless Hits',
    url: 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
    tag: 'Pop / Trending',
  },
  {
    name: 'Lofi Girl — Beats to Relax & Study To',
    url: 'https://www.youtube.com/playlist?list=PLofht4PTcKYnaH8w5gkGPE8P2t88302ZX',
    tag: 'Lo-Fi / Study',
  },
  {
    name: 'Boiler Room & Club Highlights',
    url: 'https://www.youtube.com/playlist?list=PLsPEq58sL5f_8u2g776wZ-u4h48-X6v7V',
    tag: 'Electronic / Club',
  },
];

export function YouTubeSearchModal({
  isOpen,
  onClose,
  isHost,
  initialTab = 'search',
  onAddTrack,
  onPlayNow,
  onAddPlaylist,
  onQueueUserPlaylist,
}: YouTubeSearchModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'playlist' | 'my-playlists'>(initialTab);

  // Dynamic Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [source, setSource] = useState<string>('curated-index');
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Playlist Import state
  const [playlistInput, setPlaylistInput] = useState('');
  const [customPlaylistName, setCustomPlaylistName] = useState('');
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<YouTubeTrack[]>([]);
  const [playlistSuccessMsg, setPlaylistSuccessMsg] = useState<string | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);

  // User-wise Saved Playlists state
  const [savedPlaylists, setSavedPlaylists] = useState<UserPlaylist[]>([]);
  const [loadingSavedPlaylists, setLoadingSavedPlaylists] = useState(false);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [queuingPlaylistId, setQueuingPlaylistId] = useState<string | null>(null);

  // Synchronize initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (results.length === 0) {
        performSearch('');
      }
      loadUserPlaylists();
    }
  }, [isOpen, initialTab]);

  const loadUserPlaylists = async () => {
    setLoadingSavedPlaylists(true);
    try {
      const res = await apiRequest<{ playlists: UserPlaylist[] }>('/api/playlists');
      setSavedPlaylists(res.playlists || []);
    } catch {
      // ignore
    } finally {
      setLoadingSavedPlaylists(false);
    }
  };

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: YouTubeTrack[]; source: string }>(
        `/api/youtube/search?q=${encodeURIComponent(searchQuery)}`
      );
      setResults(res.items || []);
      setSource(res.source);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Dynamic Live Search: fires debounced as user types
  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      performSearch(val);
    }, 350);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSearch(query);
  };

  const handleAdd = async (track: YouTubeTrack) => {
    await onAddTrack(track);
    setAddedIds((prev) => ({ ...prev, [track.videoId]: true }));
  };

  // Fetch playlist for preview
  const handleInspectPlaylist = async (urlToInspect?: string) => {
    const targetUrl = urlToInspect || playlistInput;
    if (!targetUrl.trim()) {
      setPlaylistError('Please paste a YouTube playlist link or ID.');
      return;
    }
    setPlaylistError(null);
    setPlaylistSuccessMsg(null);
    setLoadingPlaylist(true);
    try {
      const res = await apiRequest<{
        title: string;
        playlistId: string;
        tracks: YouTubeTrack[];
      }>(`/api/youtube/playlist?url=${encodeURIComponent(targetUrl.trim())}`);

      setPlaylistTitle(res.title);
      setCustomPlaylistName(res.title);
      setPlaylistTracks(res.tracks || []);
      if (!urlToInspect) {
        setPlaylistInput(targetUrl);
      }
    } catch (err) {
      setPlaylistError((err as Error).message);
    } finally {
      setLoadingPlaylist(false);
    }
  };

  // Enqueue entire playlist into room queue
  const handleEnqueueCompletePlaylist = async () => {
    if (!onAddPlaylist) {
      setPlaylistError('Playlist importing is not supported in this view.');
      return;
    }
    if (playlistTracks.length === 0) {
      setPlaylistError('No tracks available to add.');
      return;
    }
    setImportingPlaylist(true);
    setPlaylistError(null);
    try {
      const chosenName = customPlaylistName.trim() || playlistTitle || 'YouTube Playlist';
      await onAddPlaylist(playlistInput, playlistTracks, chosenName);
      setPlaylistSuccessMsg(
        `Successfully added ${playlistTracks.length} tracks from "${chosenName}" to the queue & saved to your playlists!`
      );
      loadUserPlaylists();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setPlaylistError((err as Error).message);
    } finally {
      setImportingPlaylist(false);
    }
  };

  // Enqueue saved user playlist
  const handleQueueSavedPlaylist = async (playlist: UserPlaylist) => {
    setQueuingPlaylistId(playlist.playlistId);
    try {
      if (onQueueUserPlaylist) {
        await onQueueUserPlaylist(playlist.playlistId);
      } else if (onAddPlaylist) {
        await onAddPlaylist('', playlist.tracks, playlist.name);
      }
      onClose();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setQueuingPlaylistId(null);
    }
  };

  const handleDeleteSavedPlaylist = async (playlistId: string) => {
    try {
      await apiRequest(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      setSavedPlaylists((prev) => prev.filter((p) => p.playlistId !== playlistId));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/10 text-red-600 dark:text-red-500 flex items-center justify-center">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                YouTube Music & Playlists
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Search songs, import complete YouTube playlists with custom names, and play saved playlists
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Tab Switcher */}
        <div className="px-6 pt-3 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#181B28]">
            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all truncate ${
                activeTab === 'search'
                  ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Search Songs</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('playlist')}
              className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all truncate ${
                activeTab === 'playlist'
                  ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Import Playlist</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('my-playlists');
                loadUserPlaylists();
              }}
              className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all truncate ${
                activeTab === 'my-playlists'
                  ? 'bg-white dark:bg-[#11131C] text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">My Playlists ({savedPlaylists.length})</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: DYNAMIC SONG SEARCH */}
        {/* ============================================================== */}
        {activeTab === 'search' && (
          <div className="flex flex-col flex-1 min-h-0">
            <form onSubmit={handleSearchSubmit} className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Search songs, artists, or paste video URL (updates live)..."
                    className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  {loading && (
                    <Loader2 className="w-4 h-4 text-violet-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shrink-0"
                >
                  Search
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  {source === 'youtube-live' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Live YouTube Data API v3 Search
                    </span>
                  ) : (
                    <span>Curated Music Index</span>
                  )}
                </span>
                <span>{results.length} songs found</span>
              </div>
            </form>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {results.length === 0 && !loading && (
                <div className="py-12 text-center space-y-2">
                  <Music className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No songs found for &ldquo;{query}&rdquo;. Try another title or artist.
                  </p>
                </div>
              )}

              {results.map((track) => (
                <div
                  key={track.videoId}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200/60 dark:border-slate-800 hover:border-violet-500/50 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      referrerPolicy="no-referrer"
                      className="w-14 h-10 rounded-lg object-cover shrink-0 bg-slate-900"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {track.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {track.channelTitle} · {track.durationFormatted}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => onPlayNow(track)}
                        title="Play right now"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors flex items-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span className="hidden sm:inline">Play</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={addedIds[track.videoId]}
                      onClick={() => handleAdd(track)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        addedIds[track.videoId]
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-violet-600 hover:text-white'
                      }`}
                    >
                      {addedIds[track.videoId] ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Queue</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: IMPORT FULL YOUTUBE PLAYLIST WITH NAME & SAVE */}
        {/* ============================================================== */}
        {activeTab === 'playlist' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Enter YouTube Playlist URL or ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={playlistInput}
                  onChange={(e) => setPlaylistInput(e.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  type="button"
                  disabled={loadingPlaylist}
                  onClick={() => handleInspectPlaylist()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-all whitespace-nowrap shadow-sm"
                >
                  {loadingPlaylist ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Scanning...</span>
                    </span>
                  ) : (
                    <span>Inspect Playlist</span>
                  )}
                </button>
              </div>

              {/* Quick Pick Playlists */}
              <div className="pt-2">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Or load one of these popular playlists:
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PLAYLISTS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      disabled={loadingPlaylist}
                      onClick={() => handleInspectPlaylist(p.url)}
                      className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-[#181B28] hover:bg-violet-500/15 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors"
                    >
                      {p.name} ({p.tag})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {playlistError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                {playlistError}
              </div>
            )}

            {playlistSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{playlistSuccessMsg}</span>
              </div>
            )}

            {/* Playlist Preview & Save Form */}
            {playlistTracks.length > 0 && (
              <div className="space-y-3.5 flex-1 min-h-0 flex flex-col pt-2 border-t border-slate-200 dark:border-slate-800">
                {/* Playlist Name Input */}
                <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/30 space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>Playlist Name (User-Wise Saved)</span>
                      <span className="text-[10px] text-violet-600 dark:text-violet-400 font-mono">
                        {playlistTracks.length} tracks detected
                      </span>
                    </label>
                    <input
                      type="text"
                      value={customPlaylistName}
                      onChange={(e) => setCustomPlaylistName(e.target.value)}
                      placeholder="e.g. Office Friday Beats"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-[#11131C] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Will be saved under <strong>My Playlists</strong> so you can select and play again anytime.
                    </p>
                    <button
                      type="button"
                      disabled={importingPlaylist}
                      onClick={handleEnqueueCompletePlaylist}
                      className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {importingPlaylist ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importing & Saving...</span>
                        </>
                      ) : (
                        <>
                          <ListPlus className="w-4 h-4" />
                          <span>Import & Save Playlist</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Tracks list preview */}
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 space-y-2 max-h-56 overflow-y-auto">
                  {playlistTracks.map((track, i) => (
                    <div
                      key={`${track.videoId}-${i}`}
                      className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white dark:bg-[#11131C] border border-slate-200/60 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 text-[11px] font-mono text-slate-400 text-right shrink-0">
                          {i + 1}.
                        </span>
                        <img
                          src={track.thumbnailUrl}
                          alt={track.title}
                          className="w-10 h-7 rounded object-cover shrink-0 bg-slate-900"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-white truncate">
                            {track.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {track.channelTitle}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {track.durationFormatted}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: USER-WISE SAVED PLAYLISTS (SELECT & PLAY AGAIN) */}
        {/* ============================================================== */}
        {activeTab === 'my-playlists' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  My Saved Playlists ({savedPlaylists.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select any playlist to queue all its songs into this Jam Room
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('playlist')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Import New</span>
              </button>
            </div>

            {loadingSavedPlaylists && (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading your playlists...</span>
              </div>
            )}

            {!loadingSavedPlaylists && savedPlaylists.length === 0 && (
              <div className="py-12 text-center space-y-3 rounded-2xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 p-6">
                <ListMusic className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    No Saved Playlists Yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Import any YouTube playlist using the &ldquo;Import Playlist&rdquo; tab, give it a custom name, and it will be saved here permanently to play again!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('playlist')}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  Import Your First Playlist
                </button>
              </div>
            )}

            {!loadingSavedPlaylists && savedPlaylists.length > 0 && (
              <div className="space-y-3">
                {savedPlaylists.map((pl) => {
                  const isExpanded = expandedPlaylistId === pl.playlistId;
                  const isQueuing = queuingPlaylistId === pl.playlistId;

                  return (
                    <div
                      key={pl.playlistId}
                      className="rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {pl.thumbnailUrl ? (
                            <img
                              src={pl.thumbnailUrl}
                              alt={pl.name}
                              className="w-12 h-9 rounded-lg object-cover shrink-0 bg-slate-900"
                            />
                          ) : (
                            <div className="w-12 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                              <ListMusic className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                              {pl.name}
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {pl.trackCount} songs · {new Date(pl.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPlaylistId(isExpanded ? null : pl.playlistId)
                            }
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title={isExpanded ? 'Collapse tracks' : 'View tracks'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSavedPlaylist(pl.playlistId)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Delete playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={isQueuing}
                            onClick={() => handleQueueSavedPlaylist(pl)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm transition-all whitespace-nowrap"
                          >
                            {isQueuing ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Queuing...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" />
                                <span>Play in Jam</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Collapsible Tracks View */}
                      {isExpanded && pl.tracks && (
                        <div className="p-3 pt-0 border-t border-slate-200/60 dark:border-slate-800/80 space-y-1.5 max-h-48 overflow-y-auto">
                          {pl.tracks.map((t, idx) => (
                            <div
                              key={`${t.videoId}-${idx}`}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white dark:bg-[#11131C]"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[10px] font-mono text-slate-400 w-4 text-right">
                                  {idx + 1}.
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {t.title}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-400 ml-2">
                                {t.durationFormatted}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
