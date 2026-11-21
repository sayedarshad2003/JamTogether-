import React from 'react';
import {
  ListMusic,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Play,
  Music2,
  ListPlus,
} from 'lucide-react';
import { QueueItem, YouTubeTrack } from '../types/jam.ts';

interface SharedQueuePanelProps {
  queue: QueueItem[];
  currentVideoId: string;
  currentUserId?: string;
  isHost: boolean;
  onSelectTrack: (track: YouTubeTrack) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onReorderItem: (itemId: string, direction: 'up' | 'down') => Promise<void>;
  onOpenSearch: (tab?: 'search' | 'playlist' | 'my-playlists') => void;
  className?: string;
  hideHeader?: boolean;
}

export function SharedQueuePanel({
  queue,
  currentVideoId,
  currentUserId,
  isHost,
  onSelectTrack,
  onRemoveItem,
  onReorderItem,
  onOpenSearch,
  className = '',
  hideHeader = false,
}: SharedQueuePanelProps) {
  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${
        className || 'rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800'
      }`}
    >
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Shared Queue ({queue.length})
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenSearch('my-playlists')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all whitespace-nowrap"
            title="My Saved Playlists"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>My Playlists</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSearch('playlist')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#181B28] hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-all whitespace-nowrap"
            title="Import full YouTube playlist"
          >
            <ListPlus className="w-3.5 h-3.5 text-violet-500" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSearch('search')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Song</span>
          </button>
        </div>
      </div>
      )}

      <div className="p-3 overflow-y-auto space-y-2 flex-1">
        {queue.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <Music2 className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The shared queue is empty. Anyone in the room can add songs or full playlists!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenSearch('search')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm"
              >
                Search Songs
              </button>
              <button
                type="button"
                onClick={() => onOpenSearch('playlist')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-sm"
              >
                Import Playlist
              </button>
              <button
                type="button"
                onClick={() => onOpenSearch('my-playlists')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 transition-colors"
              >
                My Playlists
              </button>
            </div>
          </div>
        ) : (
          queue.map((item, idx) => {
            const isPlaying = item.track.videoId === currentVideoId;
            const canRemove = isHost || item.addedByUserId === currentUserId;

            return (
              <div
                key={item.itemId}
                className={`group flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors ${
                  isPlaying
                    ? 'bg-violet-500/10 border-violet-500/40'
                    : 'bg-slate-50 dark:bg-[#181B28] border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-14 h-10 rounded-lg overflow-hidden bg-slate-900 shrink-0">
                    <img
                      src={item.track.thumbnailUrl}
                      alt={item.track.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {isPlaying && (
                      <div className="absolute inset-0 bg-violet-950/70 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-violet-300 font-mono">
                          NOW
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isPlaying
                          ? 'text-violet-600 dark:text-violet-300'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {item.track.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.track.channelTitle} · Queued by {item.addedByUsername}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isHost && !isPlaying && (
                    <button
                      type="button"
                      onClick={() => onSelectTrack(item.track)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                      title="Play now"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isHost && (
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onReorderItem(item.itemId, 'up')}
                        className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === queue.length - 1}
                        onClick={() => onReorderItem(item.itemId, 'down')}
                        className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.itemId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
