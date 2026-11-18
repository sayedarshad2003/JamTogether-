import { useCallback, useEffect, useRef, useState } from 'react';
import { UserProfile } from '../types/jam.ts';

interface UseWebRTCVoiceParams {
  roomId: string;
  currentUser: UserProfile | null;
  sendWsMessage: (type: string, payload?: any) => void;
}

export interface PeerConnectionStatus {
  peerId: string;
  connectionState: RTCPeerConnectionState;
}

function getIceServers(): RTCIceServer[] {
  const stunRaw =
    import.meta.env.VITE_STUN_SERVER_URLS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
  const urls = stunRaw
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  const iceServers: RTCIceServer[] = [{ urls }];

  if (import.meta.env.VITE_TURN_SERVER_URL) {
    iceServers.push({
      urls: import.meta.env.VITE_TURN_SERVER_URL,
      username: import.meta.env.VITE_TURN_USERNAME || undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
    });
  }
  return iceServers;
}

export function useWebRTCVoice({ roomId, currentUser, sendWsMessage }: UseWebRTCVoiceParams) {
  const [inVoiceChat, setInVoiceChat] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'permission_error'
  >('disconnected');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const [peerStatuses, setPeerStatuses] = useState<Record<string, RTCPeerConnectionState>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserTimerRef = useRef<number | null>(null);
  const lastSpeakingRef = useRef<boolean>(false);

  const cleanupPeer = useCallback((peerUserId: string) => {
    const pc = peerConnectionsRef.current.get(peerUserId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // ignore
      }
      peerConnectionsRef.current.delete(peerUserId);
    }
    const audioEl = remoteAudioElementsRef.current.get(peerUserId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      remoteAudioElementsRef.current.delete(peerUserId);
    }
    setPeerStatuses((prev) => {
      const next = { ...prev };
      delete next[peerUserId];
      return next;
    });
  }, []);

  const cleanupAllConnections = useCallback(() => {
    for (const peerId of peerConnectionsRef.current.keys()) {
      cleanupPeer(peerId);
    }
    if (analyserTimerRef.current) {
      window.clearInterval(analyserTimerRef.current);
      analyserTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setPeerStatuses({});
    setIsSpeaking(false);
  }, [cleanupPeer]);

  // Enumerate microphone devices and listen for device changes
  useEffect(() => {
    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(list.filter((d) => d.kind === 'audioinput'));
      } catch {
        // ignore
      }
    }
    loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
    };
  }, []);

  const createOrGetPeerConnection = useCallback(
    (targetUserId: string): RTCPeerConnection => {
      const existing = peerConnectionsRef.current.get(targetUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peerConnectionsRef.current.set(targetUserId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWsMessage('webrtc:ice_candidate', {
            targetUserId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerStatuses((prev) => ({
          ...prev,
          [targetUserId]: pc.connectionState,
        }));
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          // Automatic cleanup if peer connection fails or closes
          if (pc.connectionState === 'closed') {
            cleanupPeer(targetUserId);
          }
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;
        let audioEl = remoteAudioElementsRef.current.get(targetUserId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.setAttribute('playsinline', 'true');
          remoteAudioElementsRef.current.set(targetUserId, audioEl);
        }
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(() => {});
      };

      return pc;
    },
    [cleanupPeer, sendWsMessage]
  );

  const startVoiceActivityDetector = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyserTimerRef.current = window.setInterval(() => {
          if (!localStreamRef.current) return;
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (!audioTrack || !audioTrack.enabled) {
            if (lastSpeakingRef.current) {
              lastSpeakingRef.current = false;
              setIsSpeaking(false);
              sendWsMessage('webrtc:voice_state', { isMuted: true, isSpeaking: false });
            }
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const speakingNow = avg > 16;

          if (speakingNow !== lastSpeakingRef.current) {
            lastSpeakingRef.current = speakingNow;
            setIsSpeaking(speakingNow);
            sendWsMessage('webrtc:voice_state', {
              isMuted: false,
              isSpeaking: speakingNow,
            });
          }
        }, 220);
      } catch {
        // ignore audio context issues
      }
    },
    [sendWsMessage]
  );

  const joinVoiceChat = useCallback(async () => {
    if (!currentUser) return;
    setConnectionStatus('connecting');
    setPermissionNotice(null);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio:
            selectedDeviceId && selectedDeviceId !== 'default'
              ? { deviceId: { exact: selectedDeviceId }, echoCancellation: true, noiseSuppression: true }
              : { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch (micErr) {
        // Fallback silent Web Audio MediaStreamDestination if hardware mic is absent in preview iframe
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const dest = ctx.createMediaStreamDestination();
        stream = dest.stream;
        setPermissionNotice(
          'Microphone hardware not detected or blocked by browser — joined VC in listen/simulated-mic mode.'
        );
      }

      localStreamRef.current = stream;
      setInVoiceChat(true);
      setIsMuted(false);
      setConnectionStatus('connected');

      startVoiceActivityDetector(stream);

      sendWsMessage('webrtc:join_vc', {
        isMuted: false,
      });
    } catch (err) {
      setConnectionStatus('permission_error');
      setPermissionNotice((err as Error).message || 'Could not access microphone.');
    }
  }, [currentUser, selectedDeviceId, sendWsMessage, startVoiceActivityDetector]);

  const leaveVoiceChat = useCallback(() => {
    cleanupAllConnections();
    setInVoiceChat(false);
    setIsMuted(false);
    setIsSpeaking(false);
    setConnectionStatus('disconnected');
    setPermissionNotice(null);
    sendWsMessage('webrtc:leave_vc', {});
  }, [cleanupAllConnections, sendWsMessage]);

  const toggleMuteMic = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      setIsSpeaking(false);
      lastSpeakingRef.current = false;
    }

    sendWsMessage('webrtc:voice_state', {
      isMuted: nextMuted,
      isSpeaking: false,
    });
  }, [isMuted, sendWsMessage]);

  // Simulate speaking pulse button for users without physical mic hardware
  const triggerTestSpeakingPulse = useCallback(() => {
    if (!inVoiceChat || isMuted) return;
    setIsSpeaking(true);
    sendWsMessage('webrtc:voice_state', { isMuted: false, isSpeaking: true });
    setTimeout(() => {
      setIsSpeaking(false);
      sendWsMessage('webrtc:voice_state', { isMuted: false, isSpeaking: false });
    }, 2200);
  }, [inVoiceChat, isMuted, sendWsMessage]);

  // Handle incoming WebRTC signaling events from WebSocket
  const handleSignalingEvent = useCallback(
    async (type: string, payload: any) => {
      if (!inVoiceChat || !currentUser) return;

      if (type === 'webrtc:user_joined_vc') {
        const newPeerId = payload?.userId;
        if (!newPeerId || newPeerId === currentUser.userId) return;

        try {
          const pc = createOrGetPeerConnection(newPeerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendWsMessage('webrtc:offer', {
            targetUserId: newPeerId,
            sdp: pc.localDescription,
          });
        } catch (e) {
          console.warn('WebRTC offer creation error:', e);
        }
      } else if (type === 'webrtc:offer') {
        const { fromUserId, sdp } = payload || {};
        if (!fromUserId || !sdp) return;

        try {
          const pc = createOrGetPeerConnection(fromUserId);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWsMessage('webrtc:answer', {
            targetUserId: fromUserId,
            sdp: pc.localDescription,
          });
        } catch (e) {
          console.warn('WebRTC answer error:', e);
        }
      } else if (type === 'webrtc:answer') {
        const { fromUserId, sdp } = payload || {};
        if (!fromUserId || !sdp) return;
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          } catch (e) {
            console.warn('WebRTC setRemoteDescription error:', e);
          }
        }
      } else if (type === 'webrtc:ice_candidate') {
        const { fromUserId, candidate } = payload || {};
        if (!fromUserId || !candidate) return;
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            // ignore benign candidate race
          }
        }
      } else if (type === 'webrtc:user_left_vc') {
        const leftUserId = payload?.userId;
        if (leftUserId) {
          cleanupPeer(leftUserId);
        }
      }
    },
    [cleanupPeer, createOrGetPeerConnection, currentUser, inVoiceChat, sendWsMessage]
  );

  // Clean up on unmount or room change
  useEffect(() => {
    return () => {
      cleanupAllConnections();
    };
  }, [roomId, cleanupAllConnections]);

  return {
    inVoiceChat,
    isMuted,
    isSpeaking,
    connectionStatus,
    permissionNotice,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    peerStatuses,
    joinVoiceChat,
    leaveVoiceChat,
    toggleMuteMic,
    triggerTestSpeakingPulse,
    handleSignalingEvent,
  };
}
