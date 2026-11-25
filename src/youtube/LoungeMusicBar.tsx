import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  ListMusic,
  Tv,
  Sparkles,
} from 'lucide-react';
import { PlaybackState, QueueItem, YouTubeTrack } from '../types/jam';

interface LoungeMusicBarProps {
  playback: PlaybackState;
  queue: QueueItem[];
  isHost: boolean;
  onPlaybackAction: (
    action: 'play' | 'pause' | 'seek' | 'next' | 'previous',
    positionSec?: number
  ) => Promise<void>;
  onOpenSearch: (tab?: 'search' | 'playlist' | 'my-playlists') => void;
  onOpenQueue: () => void;
  onSwitchToTheaterMode?: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const LoungeMusicBar: React.FC<LoungeMusicBarProps> = ({
  playback,
  queue,
  isHost,
  onPlaybackAction,
  onOpenSearch,
  onOpenQueue,
  onSwitchToTheaterMode,
}) => {
  const [localSeek, setLocalSeek] = useState<number>(playback.positionSec || 0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState<number>(75);
  const [isMuted, setIsMuted] = useState(false);

  const isPlaying = playback.status === 'playing';
  const currentTrack = playback.track;

  // Sync seek position as track plays
  useEffect(() => {
    if (isSeeking) return;
    setLocalSeek(playback.positionSec || 0);

    if (isPlaying) {
      const interval = setInterval(() => {
        setLocalSeek((prev) => {
          const next = prev + 1;
          const dur = currentTrack?.durationSec || 0;
          return dur > 0 && next > dur ? dur : next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [playback.positionSec, isPlaying, isSeeking, currentTrack]);

  const duration = currentTrack?.durationSec || 0;
  const progressPercent = duration > 0 ? Math.min(100, (localSeek / duration) * 100) : 0;

  const handleSeekCommit = (newSec: number) => {
    setIsSeeking(false);
    onPlaybackAction('seek', newSec);
  };

  return (
    <div className="w-full bg-white/95 dark:bg-[#0F1322]/95 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-2.5 sm:p-3 shadow-lg backdrop-blur-md transition-all">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
        {/* Track Thumbnail & Title */}
        <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
          <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-300 dark:border-slate-700 shadow-sm flex items-center justify-center">
            {currentTrack?.thumbnailUrl ? (
              <img
                src={currentTrack.thumbnailUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music className="w-5 h-5 text-violet-400" />
            )}

            {/* Visualizer Wave Animation */}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-0.5 pointer-events-none">
                <span className="w-1 h-3 bg-violet-400 rounded-full animate-bounce" />
                <span className="w-1 h-5 bg-fuchsia-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Sparkles className="w-2.5 h-2.5" />
                Lounge Music
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {formatTime(localSeek)} / {formatTime(duration)}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              {currentTrack?.title || 'No music playing'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {currentTrack?.channelTitle || 'Add tracks to jam background soundtrack'}
            </p>
          </div>
        </div>

        {/* Center / Right Playback Controls */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={() => onPlaybackAction(isPlaying ? 'pause' : 'play')}
            disabled={!currentTrack}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
            title={isPlaying ? 'Pause Music' : 'Play Music'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Next Track Button */}
          <button
            type="button"
            onClick={() => onPlaybackAction('next')}
            disabled={queue.length === 0}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
            title="Next Track"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Open Queue Button */}
          <button
            type="button"
            onClick={onOpenQueue}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title="View Shared Queue"
          >
            <ListMusic className="w-3.5 h-3.5 text-violet-500" />
            <span className="hidden sm:inline">Queue</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-violet-500/10 text-violet-600 dark:text-violet-400 font-bold">
              {queue.length}
            </span>
          </button>

          {/* Browse / Add Music Button */}
          <button
            type="button"
            onClick={() => onOpenSearch('search')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-xs font-bold text-violet-600 dark:text-violet-400 transition-colors cursor-pointer"
            title="Search & Add Music"
          >
            <Music className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ Music</span>
          </button>

          {/* Switch to Video Theater Mode */}
          {onSwitchToTheaterMode && (
            <button
              type="button"
              onClick={onSwitchToTheaterMode}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
              title="Switch to Full Video Theater"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Video</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-2 w-full flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={localSeek}
          onChange={(e) => {
            setIsSeeking(true);
            setLocalSeek(Number(e.target.value));
          }}
          onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
          className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-violet-600"
        />
      </div>
    </div>
  );
};
