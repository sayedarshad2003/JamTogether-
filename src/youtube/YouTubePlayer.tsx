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
  Maximize2,
  Minimize2,
  MessageSquare,
  Users,
  ListMusic,
  X,
  Crown,
  UserMinus,
} from 'lucide-react';
import {
  PlaybackState,
  YouTubeTrack,
  QueueItem,
  ChatMessage,
  RoomMember,
  UserProfile,
} from '../types/jam.ts';
import { LiveChatPanel } from '../chat/LiveChatPanel.tsx';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.tsx';
import { SharedQueuePanel } from '../playlist/SharedQueuePanel.tsx';

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
  onOpenSearch: (tab?: 'search' | 'playlist' | 'my-playlists') => void;
  // Pop-up Drawer Props & Handlers
  queue?: QueueItem[];
  messages?: ChatMessage[];
  members?: RoomMember[];
  currentUser?: UserProfile | null;
  inVoiceChat?: boolean;
  isMuted?: boolean;
  isSpeaking?: boolean;
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'permission_error';
  permissionNotice?: string | null;
  audioDevices?: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onSelectDevice?: (id: string) => void;
  peerStatuses?: Record<string, RTCPeerConnectionState>;
  onJoinVC?: () => void;
  onLeaveVC?: () => void;
  onToggleMute?: () => void;
  onTestSpeakingPulse?: () => void;
  onSendMessage?: (content: string) => Promise<void>;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void>;
  onSelectTrackFromQueue?: (track: YouTubeTrack) => Promise<void>;
  onRemoveQueueItem?: (itemId: string) => Promise<void>;
  onReorderQueueItem?: (itemId: string, direction: 'up' | 'down') => Promise<void>;
  onTransferHost?: (userId: string) => Promise<void>;
  onKickMember?: (userId: string) => Promise<void>;
  roomHostUserId?: string;
  roomHostUsername?: string;
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
  queue = [],
  messages = [],
  members = [],
  currentUser = null,
  inVoiceChat = false,
  isMuted: isLocalMuted = false,
  isSpeaking: isLocalSpeaking = false,
  connectionStatus = 'connected',
  permissionNotice = null,
  audioDevices = [],
  selectedDeviceId = 'default',
  onSelectDevice,
  peerStatuses = {},
  onJoinVC,
  onLeaveVC,
  onToggleMute: onToggleLocalMute,
  onTestSpeakingPulse,
  onSendMessage,
  onToggleReaction,
  onSelectTrackFromQueue,
  onRemoveQueueItem,
  onReorderQueueItem,
  onTransferHost,
  onKickMember,
  roomHostUserId,
  roomHostUsername,
}: YouTubePlayerProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Wrapper node: the YT API replaces its mount element with an iframe and destroy()
  // removes it, so we create a fresh inner mount element every time a player is built.
  const mountWrapperRef = useRef<HTMLDivElement | null>(null);
  const [apiReady, setApiReady] = useState<boolean>(Boolean(window.YT && window.YT.Player));
  const [playerReady, setPlayerReady] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'voice' | 'people' | 'queue' | null>(null);

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

  // Fullscreen & Inactivity Auto-Hide Support (YouTube-like controls overlay)
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<number | null>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
    // In fullscreen mode, automatically hide controls after 3.5 seconds of inactivity if playing and drawer is not open
    if (isFullscreen && latestPlaybackRef.current.status === 'playing' && !activeDrawer) {
      controlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [isFullscreen, activeDrawer]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, [resetControlsTimer, playback.status, activeDrawer]);

  // Fullscreen & Orientation Lock Support (Mobile Landscape + Desktop Fullscreen)
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!isFullscreen) {
      setIsFullscreen(true);
      setShowControls(true);
      try {
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any)?.webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        }
      } catch {
        // Fallback works automatically via fixed inset-0 pseudo-fullscreen CSS
      }
      try {
        // Lock to landscape orientation on mobile devices supporting the ScreenOrientation API
        if (window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
          await (window.screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch {}
    } else {
      setIsFullscreen(false);
      setActiveDrawer(null);
      setShowControls(true);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any)?.webkitFullscreenElement && (document as any)?.webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      } catch {}
      try {
        if (window.screen?.orientation && typeof (window.screen.orientation as any).unlock === 'function') {
          (window.screen.orientation as any).unlock();
        }
      } catch {}
    }
  }, [isFullscreen]);

  // Synchronize fullscreen state if user exits via escape or gesture
  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs = Boolean(document.fullscreenElement || (document as any)?.webkitFullscreenElement);
      if (!isNativeFs && isFullscreen) {
        setIsFullscreen(false);
        setActiveDrawer(null);
        setShowControls(true);
        try {
          if (window.screen?.orientation && typeof (window.screen.orientation as any).unlock === 'function') {
            (window.screen.orientation as any).unlock();
          }
        } catch {}
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [isFullscreen]);

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
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
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

  return isFullscreen ? (
    /* =========================================================================
       1. FULLSCREEN MODE (Edge-to-Edge, YouTube-like Auto-Hiding Controls, Full-Height Right Drawer)
       ========================================================================= */
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      onClick={resetControlsTimer}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between w-screen h-screen overflow-hidden select-none"
    >
      {/* Edge-to-Edge Video Viewport */}
      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
        {/* Iframe Mount Point */}
        <div
          ref={mountWrapperRef}
          className="w-full h-full pointer-events-none flex items-center justify-center [&>iframe]:w-full [&>iframe]:h-full"
        />

        {/* Complete Invisible Interaction Shield (Blocks direct iframe clicks, pauses, and desync) */}
        <div
          className="absolute inset-0 z-10 bg-transparent select-none cursor-default"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resetControlsTimer();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFullscreen();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-hidden="true"
        />

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
              resetControlsTimer();
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
      </div>

      {/* Top Bar (Fullscreen Overlay - Auto-Hiding like YouTube) */}
      <div
        className={`absolute inset-x-0 top-0 z-30 p-4 sm:p-5 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between text-xs text-white transition-opacity duration-300 gap-2 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white shrink-0">
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

          <div className="min-w-0 truncate">
            <span className="text-xs sm:text-sm font-bold text-white truncate drop-shadow block">
              {playback.track?.title || ''}
            </span>
            <span className="text-[11px] text-slate-300 truncate drop-shadow block">
              {playback.track?.channelTitle || 'YouTube Music'} · Synced by {playback.initiatedByUsername}
            </span>
          </div>
        </div>

        {/* Top-Right Quick Action Pills (ONLY in Fullscreen!) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Resync Audio */}
          <button
            type="button"
            onClick={handleManualResync}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white transition-colors"
            title="Resync audio with room"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Resync</span>
          </button>

          {/* Chat Pill */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold transition-all ${
              activeDrawer === 'chat'
                ? 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/40 ring-2 ring-violet-400/40'
                : 'bg-black/60 hover:bg-black/80 border-white/15 text-white'
            }`}
            title="Live Chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
            {messages.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-violet-400 text-violet-950 font-bold">
                {messages.length}
              </span>
            )}
          </button>

          {/* Voice Pill */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'voice' ? null : 'voice')}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold transition-all ${
              activeDrawer === 'voice'
                ? 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/40 ring-2 ring-violet-400/40'
                : inVoiceChat
                ? 'bg-emerald-600/80 hover:bg-emerald-600 border-emerald-400/50 text-white'
                : 'bg-black/60 hover:bg-black/80 border-white/15 text-white'
            }`}
            title="Voice Lounge"
          >
            <Radio className={`w-3.5 h-3.5 ${inVoiceChat ? 'animate-pulse text-emerald-300' : ''}`} />
            <span className="hidden sm:inline">Voice</span>
            {inVoiceChat && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* Members Pill */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'people' ? null : 'people')}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold transition-all ${
              activeDrawer === 'people'
                ? 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/40 ring-2 ring-violet-400/40'
                : 'bg-black/60 hover:bg-black/80 border-white/15 text-white'
            }`}
            title="Room Members"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Members</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20 text-white font-bold">
              {members.length}
            </span>
          </button>

          {/* Queue Pill */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'queue' ? null : 'queue')}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold transition-all ${
              activeDrawer === 'queue'
                ? 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/40 ring-2 ring-violet-400/40'
                : 'bg-black/60 hover:bg-black/80 border-white/15 text-white'
            }`}
            title="Shared Queue"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Queue</span>
            {queue.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20 text-white font-bold">
                {queue.length}
              </span>
            )}
          </button>

          {/* Exit Fullscreen Pill */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-xs font-semibold text-white transition-colors"
            title="Exit Fullscreen"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* Bottom Overlay Controls (Fullscreen - Like YouTube, Auto-Hiding) */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent transition-opacity duration-300 text-white space-y-2.5 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Bar */}
        <div className="space-y-1 group">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={Math.min(localPosition, Math.max(duration, 1))}
            disabled={!isHost}
            onMouseDown={() => {
              if (isHost) {
                setIsSeeking(true);
                setShowControls(true);
              }
            }}
            onTouchStart={() => {
              if (isHost) {
                setIsSeeking(true);
                setShowControls(true);
              }
            }}
            onChange={(e) => {
              if (!isHost) return;
              setLocalPosition(Number(e.target.value));
            }}
            onMouseUp={(e) => {
              handleSeekCommit(Number((e.target as HTMLInputElement).value));
              resetControlsTimer();
            }}
            onTouchEnd={(e) => {
              handleSeekCommit(Number((e.target as HTMLInputElement).value));
              resetControlsTimer();
            }}
            className="w-full h-1.5 group-hover:h-2 rounded-lg appearance-none bg-white/30 accent-violet-500 cursor-pointer transition-all"
          />
        </div>

        {/* Transport Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={!isHost}
              onClick={() => {
                onPlaybackAction('previous');
                resetControlsTimer();
              }}
              className="p-2 rounded-xl text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isHost ? 'Previous Track' : 'Only Host can change tracks'}
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              type="button"
              disabled={!isHost}
              onClick={() => {
                handleTogglePlayPause();
                resetControlsTimer();
              }}
              className="p-2.5 rounded-full text-white bg-violet-600 hover:bg-violet-500 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-600/40"
              title={isHost ? 'Play / Pause for Everyone' : 'Host controls playback'}
            >
              {playback.status === 'playing' ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 ml-0.5 fill-current" />
              )}
            </button>

            <button
              type="button"
              disabled={!isHost}
              onClick={() => {
                onPlaybackAction('next');
                resetControlsTimer();
              }}
              className="p-2 rounded-xl text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isHost ? 'Next Track' : 'Only Host can change tracks'}
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1 text-xs font-mono tabular-nums text-slate-300 ml-1">
              <span>{formatTime(localPosition)}</span>
              <span>/</span>
              <span>{playback.track?.durationFormatted === 'LIVE' ? 'LIVE' : formatTime(duration)}</span>
            </div>

            {/* Local Volume Slider */}
            <div className="hidden sm:flex items-center gap-2 ml-2">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1 rounded text-slate-300 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
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
                className="w-20 h-1.5 rounded-lg appearance-none bg-white/30 accent-violet-500 cursor-pointer"
              />
            </div>

            {!isHost && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 px-2 py-0.5 rounded bg-white/10">
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Host Controls</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenSearch()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Song</span>
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl text-white hover:bg-white/15 transition-colors"
              title="Exit Fullscreen"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Pop-up Modal / Drawer (Full Height, Inset-y-0) */}
      {activeDrawer && (
        <div className="absolute inset-y-0 right-0 z-40 h-full w-full sm:w-[380px] md:w-[420px] bg-slate-950/95 dark:bg-[#0B0D14]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-slate-100">
          {/* Drawer Header with Pill Tabs */}
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/10 shrink-0 bg-black/60">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setActiveDrawer('chat')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeDrawer === 'chat'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
                {messages.length > 0 && (
                  <span className="px-1 text-[10px] rounded-full bg-violet-400/20 text-violet-300">
                    {messages.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawer('voice')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeDrawer === 'voice'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Voice</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawer('people')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeDrawer === 'people'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Members</span>
                <span className="px-1 text-[10px] rounded-full bg-white/15 text-slate-200">
                  {members.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawer('queue')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeDrawer === 'queue'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Queue</span>
                {queue.length > 0 && (
                  <span className="px-1 text-[10px] rounded-full bg-white/15 text-slate-200">
                    {queue.length}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-2"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body (Full Height) */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {activeDrawer === 'chat' && (
              <LiveChatPanel
                className="h-full border-0 rounded-none bg-transparent dark:bg-transparent"
                hideHeader={true}
                messages={messages}
                members={members}
                currentUser={currentUser}
                onSendMessage={onSendMessage || (async () => {})}
                onToggleReaction={onToggleReaction || (async () => {})}
              />
            )}
            {activeDrawer === 'voice' && (
              <VoiceChatPanel
                className="h-full border-0 rounded-none bg-transparent dark:bg-transparent p-4 overflow-y-auto space-y-4"
                members={members}
                currentUser={currentUser}
                inVoiceChat={inVoiceChat}
                isMuted={isLocalMuted}
                isSpeaking={isLocalSpeaking}
                connectionStatus={connectionStatus}
                permissionNotice={permissionNotice}
                audioDevices={audioDevices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={onSelectDevice || (() => {})}
                peerStatuses={peerStatuses}
                onJoinVC={onJoinVC || (() => {})}
                onLeaveVC={onLeaveVC || (() => {})}
                onToggleMute={onToggleLocalMute || (() => {})}
                onTestSpeakingPulse={onTestSpeakingPulse || (() => {})}
              />
            )}
            {activeDrawer === 'queue' && (
              <SharedQueuePanel
                className="h-full border-0 rounded-none bg-transparent dark:bg-transparent"
                hideHeader={true}
                queue={queue}
                currentVideoId={playback.track?.videoId || ''}
                currentUserId={currentUser?.userId}
                isHost={isHost}
                onSelectTrack={onSelectTrackFromQueue || (async () => {})}
                onRemoveItem={onRemoveQueueItem || (async () => {})}
                onReorderItem={onReorderQueueItem || (async () => {})}
                onOpenSearch={onOpenSearch}
              />
            )}
            {activeDrawer === 'people' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Room Members ({members.length})
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {members.filter((m) => m.isOnline).length} online
                  </span>
                </div>
                <div className="space-y-2">
                  {members.map((member) => {
                    const isMemberHost = member.userId === roomHostUserId;
                    return (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={
                              member.avatarUrl ||
                              `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(
                                member.displayName || member.username || 'user'
                              )}`
                            }
                            alt={member.displayName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white truncate">
                                {member.displayName}
                              </span>
                              {isMemberHost && (
                                <Crown
                                  className="w-3.5 h-3.5 text-amber-400 shrink-0"
                                  aria-label="Room Host"
                                />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                              @{member.username} · {member.isOnline ? 'Online' : 'Offline'}
                            </p>
                          </div>
                        </div>
                        {isHost && !isMemberHost && (
                          <div className="flex items-center gap-1 shrink-0">
                            {onTransferHost && (
                              <button
                                type="button"
                                onClick={() => onTransferHost(member.userId)}
                                className="px-2 py-1 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
                                title="Transfer Host privileges"
                              >
                                Host
                              </button>
                            )}
                            {onKickMember && (
                              <button
                                type="button"
                                onClick={() => onKickMember(member.userId)}
                                className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/15 transition-colors"
                                title="Remove member"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  ) : (
    /* =========================================================================
       2. NORMAL VIEW (NO Chat/Voice/Members/Queue in Video Overlay; Standard Card Layout)
       ========================================================================= */
    <div
      ref={containerRef}
      className="rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm"
    >
      {/* Embedded 16:9 YouTube IFrame Viewport */}
      <div className="relative aspect-video w-full bg-black overflow-hidden select-none">
        {/* Iframe Mount Point (Clicks blocked at iframe level) */}
        <div
          ref={mountWrapperRef}
          className="w-full h-full pointer-events-none flex items-center justify-center [&>iframe]:w-full [&>iframe]:h-full"
        />

        {/* Complete Invisible Shield Layer (Blocks any direct click, pause, drag, context menu, or navigation from video display) */}
        <div
          className="absolute inset-0 z-10 bg-transparent select-none cursor-default"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFullscreen();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-hidden="true"
        />

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

        {/* Sleek Top Overlay Bar in Normal Mode (NO Chat, Voice, Members, Queue pills!) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/80 via-black/25 to-transparent flex items-center justify-between text-xs text-white z-20">
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
            {/* Resync Audio */}
            <button
              type="button"
              onClick={handleManualResync}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white transition-colors"
              title="Resync audio with room"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Resync Audio</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white transition-colors"
              title="Fullscreen (Rotate Landscape)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>
          </div>
        </div>
      </div>

      {/* Normal Mode Footer: Track Metadata & Master Transport Controls */}
      <div className="p-5 space-y-4 bg-white dark:bg-[#11131C]">
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
            onClick={() => onOpenSearch()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shrink-0 self-start sm:self-auto shadow-sm"
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
