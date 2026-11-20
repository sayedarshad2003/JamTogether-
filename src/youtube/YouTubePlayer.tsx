import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  RefreshCw,
  Radio,
  Lock,
  Plus,
} from 'lucide-react';
import { PlaybackState, YouTubeTrack } from '../types/jam.ts';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface YouTubePlayerProps {
  playback: PlaybackState;
  isHost: boolean;
  onPlaybackAction: (
    action: 'play' | 'pause' | 'seek' | 'next' | 'previous',
    positionSec?: number,
    allowMemberAutoAdvance?: boolean
  ) => Promise<void>;
  onRequestSyncCheck: () => void;
  onOpenSearch: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function YouTubePlayer({
  playback,
  isHost,
  onPlaybackAction,
  onRequestSyncCheck,
  onOpenSearch,
}: YouTubePlayerProps) {
  const playerRef = useRef<any>(null);
  // Wrapper node: the YT API replaces its mount element with an iframe and destroy()
  // removes it, so we create a fresh inner mount element every time a player is built.
  const mountWrapperRef = useRef<HTMLDivElement | null>(null);
  const [apiReady, setApiReady] = useState<boolean>(Boolean(window.YT && window.YT.Player));
  const [playerReady, setPlayerReady] = useState(false);

  const [localPosition, setLocalPosition] = useState<number>(playback.positionSec || 0);
  const [duration, setDuration] = useState<number>(playback.track?.durationSec || 300);
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [syncDriftMs, setSyncDriftMs] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const latestPlaybackRef = useRef<PlaybackState>(playback);
  latestPlaybackRef.current = playback;

  // Keep volatile values in refs so the player is NOT rebuilt when they change
  const onPlaybackActionRef = useRef(onPlaybackAction);
  onPlaybackActionRef.current = onPlaybackAction;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // playVideo() never throws when the browser blocks autoplay, it just silently stays
  // paused. So: try, then verify shortly after; if still not playing, fall back to
  // muted playback (always allowed) and show the "tap to enable sound" overlay.
  const tryPlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.playVideo?.();
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      const pl = playerRef.current;
      if (!pl || latestPlaybackRef.current.status !== 'playing') return;
      const st = pl.getPlayerState?.();
      if (st !== 1 && st !== 3) {
        try {
          pl.mute?.();
          setIsMuted(true);
          pl.playVideo?.();
        } catch {
          // ignore
        }
        setAutoplayBlocked(true);
      }
    }, 1200);
  }, []);

  // Load official YouTube IFrame Player API script once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      setApiReady(true);
    };

    const pollTimer = setInterval(() => {
      if (window.YT && window.YT.Player) {
        setApiReady(true);
        clearInterval(pollTimer);
      }
    }, 250);

    return () => clearInterval(pollTimer);
  }, []);

  // Calculate expected server-authoritative position at current instant
  const getExpectedPosition = useCallback((state: PlaybackState): number => {
    if (state.status !== 'playing') {
      return state.positionSec;
    }
    const elapsedSec = Math.max(0, (Date.now() - state.serverTimestamp) / 1000);
    return state.positionSec + elapsedSec;
  }, []);

  // Initialize YT.Player instance when API is ready
  useEffect(() => {
    if (!apiReady) return;

    if (playerRef.current) {
      return;
    }

    const initialExpected = getExpectedPosition(latestPlaybackRef.current);

    const wrapper = mountWrapperRef.current;
    if (!wrapper) return;
    wrapper.innerHTML = '';
    const mountEl = document.createElement('div');
    mountEl.style.width = '100%';
    mountEl.style.height = '100%';
    wrapper.appendChild(mountEl);

    playerRef.current = new window.YT.Player(mountEl, {
      height: '100%',
      width: '100%',
      videoId: latestPlaybackRef.current.videoId,
      playerVars: {
        autoplay: latestPlaybackRef.current.status === 'playing' ? 1 : 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        start: Math.floor(initialExpected),
        origin: window.location.origin,
      },
      events: {
        onReady: (event: any) => {
          setPlayerReady(true);
          setPlayerError(null);
          event.target.setVolume(volumeRef.current);
          const d = event.target.getDuration();
          if (d && d > 0) setDuration(d);

          const curState = latestPlaybackRef.current;
          const targetVideoId = curState.videoId;
          const expected = getExpectedPosition(curState);

          if (targetVideoId) {
            const loaded = event.target.getVideoData?.()?.video_id;
            if (loaded !== targetVideoId) {
              if (typeof event.target.loadVideoById === 'function') {
                event.target.loadVideoById({
                  videoId: targetVideoId,
                  startSeconds: expected,
                });
              }
            } else {
              event.target.seekTo(expected, true);
            }

            if (curState.status === 'playing') {
              tryPlay();
            } else {
              event.target.pauseVideo();
            }
          }
        },
        onAutoplayBlocked: () => {
          try {
            playerRef.current?.mute?.();
            setIsMuted(true);
            playerRef.current?.playVideo?.();
          } catch {
            // ignore
          }
          setAutoplayBlocked(true);
        },
        onError: (event: any) => {
          const code = Number(event?.data);
          if (code === 101 || code === 150) {
            setPlayerError('The owner of this video has disabled embedding, so it cannot play here.');
          } else if (code === 100) {
            setPlayerError('This video is unavailable (removed or private).');
          } else if (code === 2) {
            setPlayerError('This video link is invalid.');
          } else {
            setPlayerError('The video could not be loaded. Try Resync or ask the host to pick another track.');
          }
        },
        onStateChange: (event: any) => {
          const ytState = event.data;
          // 1 is PLAYING, 2 is PAUSED, 3 is BUFFERING, 0 is ENDED
          // Only clear the "tap to enable sound" overlay once audio is really on
          if (ytState === 1) {
            setPlayerError(null);
            if (!event.target.isMuted?.()) {
              setAutoplayBlocked(false);
            }
          }
          const dur = event.target.getDuration?.();
          if (dur && dur > 0) {
            setDuration(dur);
          }
          // YT.PlayerState.ENDED === 0 -> Automatically play next queued song
          if (ytState === 0) {
            onPlaybackActionRef.current('next', 0, true);
          }
        },
      },
    });

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }
      playerRef.current = null;
      setPlayerReady(false);
      if (mountWrapperRef.current) mountWrapperRef.current.innerHTML = '';
    };
  }, [apiReady, getExpectedPosition, tryPlay]);

  // React to server playback changes (video change, play/pause, seek)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;

    const loadedVideoId = typeof player.getVideoData === 'function' ? player.getVideoData()?.video_id : null;
    const expectedPos = getExpectedPosition(playback);

    // If there is a video in playback and it differs from currently loaded video:
    if (playback.videoId && loadedVideoId !== playback.videoId) {
      if (typeof player.loadVideoById === 'function') {
        player.loadVideoById({
          videoId: playback.videoId,
          startSeconds: expectedPos,
        });
      } else if (typeof player.cueVideoById === 'function') {
        player.cueVideoById({
          videoId: playback.videoId,
          startSeconds: expectedPos,
        });
      }

      if (playback.status === 'paused') {
        setTimeout(() => player.pauseVideo?.(), 300);
      } else {
        setTimeout(() => tryPlay(), 150);
      }
      setLocalPosition(expectedPos);
      return;
    }

    if (playback.videoId && typeof player.getCurrentTime === 'function') {
      const currentPos = Number(player.getCurrentTime() || 0);
      const driftSec = Math.abs(currentPos - expectedPos);
      setSyncDriftMs(Math.round(driftSec * 1000));

      if (driftSec > 2.0) {
        player.seekTo(expectedPos, true);
        setLocalPosition(expectedPos);
      }

      const playerState = player.getPlayerState?.();
      if (playback.status === 'playing' && playerState !== 1 && playerState !== 3) {
        tryPlay();
      } else if (playback.status === 'paused' && playerState === 1) {
        player.pauseVideo?.();
      }
    }
  }, [playback, playerReady, getExpectedPosition, tryPlay]);

  // Periodic 500ms UI progress update & drift reconciliation
  useEffect(() => {
    const interval = setInterval(() => {
      if (isSeeking) return;
      const state = latestPlaybackRef.current;
      const expected = getExpectedPosition(state);
      const player = playerRef.current;

      if (player && playerReady && typeof player.getCurrentTime === 'function') {
        const actual = Number(player.getCurrentTime() || 0);
        const dur = Number(player.getDuration?.() || state.track?.durationSec || 300);
        if (dur > 0) setDuration(dur);

        if (actual > 0) {
          setLocalPosition(actual);
          const drift = Math.abs(actual - expected);
          setSyncDriftMs(Math.round(drift * 1000));
          // Correct if drift exceeds 2.5s while playing
          if (state.status === 'playing' && drift > 2.5) {
            player.seekTo(expected, true);
          }
        } else {
          setLocalPosition(expected);
        }
      } else {
        setLocalPosition(expected);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playerReady, isSeeking, getExpectedPosition]);

  // Periodic 10s server sync heartbeat
  useEffect(() => {
    const syncTimer = setInterval(() => {
      onRequestSyncCheck();
    }, 10000);
    return () => clearInterval(syncTimer);
  }, [onRequestSyncCheck]);

  const handleTogglePlayPause = () => {
    if (!isHost) return;
    if (playback.status === 'playing') {
      onPlaybackAction('pause', localPosition);
    } else {
      onPlaybackAction('play', localPosition);
    }
  };

  const handleSeekCommit = (newSec: number) => {
    setIsSeeking(false);
    if (!isHost) return;
    setLocalPosition(newSec);
    if (playerRef.current && playerReady) {
      playerRef.current.seekTo(newSec, true);
    }
    onPlaybackAction('seek', newSec);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setIsMuted(val === 0);
    if (playerRef.current && playerReady) {
      playerRef.current.setVolume(val);
      if (val === 0) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    }
  };

  const toggleMute = () => {
    if (!playerRef.current || !playerReady) return;
    if (isMuted) {
      setIsMuted(false);
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 75);
    } else {
      setIsMuted(true);
      playerRef.current.mute();
    }
  };

  const handleManualResync = () => {
    onRequestSyncCheck();
    const expected = getExpectedPosition(playback);
    if (playerRef.current && playerReady) {
      playerRef.current.seekTo(expected, true);
      if (playback.status === 'playing') {
        playerRef.current.playVideo();
      }
    }
    setLocalPosition(expected);
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      {/* Embedded 16:9 YouTube IFrame Viewport */}
      <div className="relative aspect-video w-full bg-black overflow-hidden">
        <div ref={mountWrapperRef} className="w-full h-full" />

        {/* Embed / load error overlay */}
        {playerError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-4 text-center space-y-2">
            <p className="text-sm font-bold text-white">Video unavailable</p>
            <p className="text-xs text-slate-300 max-w-sm">{playerError}</p>
          </div>
        )}

        {/* Browser Autoplay Blocked Banner */}
        {autoplayBlocked && playback.status === 'playing' && (
          <div
            onClick={() => {
              if (playerRef.current) {
                playerRef.current.unMute?.();
                playerRef.current.setVolume?.(volumeRef.current || 75);
                playerRef.current.seekTo?.(getExpectedPosition(latestPlaybackRef.current), true);
                playerRef.current.playVideo?.();
                setIsMuted(false);
              }
              setAutoplayBlocked(false);
            }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm cursor-pointer p-4 space-y-3 animate-in fade-in"
          >
            <div className="w-16 h-16 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105">
              <Play className="w-8 h-8 ml-1 fill-current" />
            </div>
            <div className="text-center text-white space-y-1">
              <p className="text-sm font-bold">Host is playing live in this room!</p>
              <p className="text-xs text-violet-300">Click anywhere to start video and listen with friends</p>
            </div>
          </div>
        )}

        {/* Sleek Top Overlay Bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/80 via-black/25 to-transparent flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white">
              {playback.status === 'playing' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Live Sync</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Paused</span>
                </>
              )}
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualResync}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white transition-colors"
              title="Resync audio with room"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">Resync Audio</span>
            </button>
          </div>
        </div>
      </div>

      {/* Track Metadata & Master Transport Controls */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {playback.track?.title || 'Select a song from the queue'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span>{playback.track?.channelTitle || 'YouTube Music'}</span>
              <span aria-hidden="true">·</span>
              <span>Synced by {playback.initiatedByUsername}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Song from YouTube</span>
          </button>
        </div>

        {/* Synchronized Scrubber Bar */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={Math.min(localPosition, Math.max(duration, 1))}
            disabled={!isHost}
            onMouseDown={() => isHost && setIsSeeking(true)}
            onTouchStart={() => isHost && setIsSeeking(true)}
            onChange={(e) => {
              if (!isHost) return;
              setLocalPosition(Number(e.target.value));
            }}
            onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
            className={`w-full h-1.5 rounded-lg appearance-none bg-slate-200 dark:bg-slate-800 accent-violet-600 ${
              isHost ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
            }`}
          />
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span>{formatTime(localPosition)}</span>
            <span>
              {playback.track?.durationFormatted === 'LIVE' ? 'LIVE STREAM' : formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Transport Deck */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isHost}
              onClick={() => onPlaybackAction('previous')}
              className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isHost ? 'Previous Track' : 'Only the Room Host can change tracks'}
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={!isHost}
              onClick={handleTogglePlayPause}
              className="p-3 rounded-xl text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              title={isHost ? 'Play / Pause for Everyone' : 'Host controls playback'}
            >
              {playback.status === 'playing' ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              disabled={!isHost}
              onClick={() => onPlaybackAction('next')}
              className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isHost ? 'Skip to Next Track' : 'Only the Room Host can skip tracks'}
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {!isHost && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ml-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#181B28]">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-medium">Host Controls</span>
              </span>
            )}
          </div>

          {/* Local Listener Volume Control */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              aria-label="Toggle local mute"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-500" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-24 h-1.5 rounded-lg appearance-none bg-slate-200 dark:bg-slate-800 accent-violet-600 cursor-pointer"
              aria-label="Volume"
            />
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 w-8 text-right">
              {isMuted ? '0%' : `${volume}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
