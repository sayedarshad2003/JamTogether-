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
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302,stun:stun3.l.google.com:19302,stun:stun4.l.google.com:19302,stun:stun.cloudflare.com:3478';
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
  const iceCandidateQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserTimerRef = useRef<number | null>(null);
  const lastSpeakingRef = useRef<boolean>(false);

  // Synchronous refs for event handlers to prevent closure state-staleness
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  currentUserRef.current = currentUser;
  const inVoiceChatRef = useRef<boolean>(inVoiceChat);
  inVoiceChatRef.current = inVoiceChat;

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
      try {
        audioEl.pause();
        audioEl.srcObject = null;
      } catch {
        // ignore
      }
      audioEl.remove();
      remoteAudioElementsRef.current.delete(peerUserId);
    }
    iceCandidateQueuesRef.current.delete(peerUserId);
    setPeerStatuses((prev) => {
      const next = { ...prev };
      delete next[peerUserId];
      return next;
    });
  }, []);

  const cleanupAllConnections = useCallback(() => {
    for (const peerId of Array.from(peerConnectionsRef.current.keys())) {
      cleanupPeer(peerId);
    }
    for (const [peerId, audioEl] of Array.from(remoteAudioElementsRef.current.entries())) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
      } catch {
        // ignore
      }
      remoteAudioElementsRef.current.delete(peerId);
    }
    iceCandidateQueuesRef.current.clear();
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
      if (existing && existing.signalingState !== 'closed') return existing;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peerConnectionsRef.current.set(targetUserId, pc);

      // Attach existing local audio tracks to the new peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && currentUserRef.current) {
          sendWsMessage('webrtc:ice_candidate', {
            fromUserId: currentUserRef.current.userId,
            targetUserId,
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
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
          if (pc.connectionState === 'failed') {
            try {
              pc.restartIce();
            } catch {
              // ignore
            }
          } else if (pc.connectionState === 'closed') {
            cleanupPeer(targetUserId);
          }
        }
      };

      pc.ontrack = (event) => {
        const remoteStream =
          event.streams && event.streams[0]
            ? event.streams[0]
            : new MediaStream([event.track]);

        let audioEl = remoteAudioElementsRef.current.get(targetUserId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = `remote-audio-${targetUserId}`;
          audioEl.autoplay = true;
          audioEl.setAttribute('playsinline', 'true');
          audioEl.volume = 1.0;
          audioEl.muted = false;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          remoteAudioElementsRef.current.set(targetUserId, audioEl);
        }

        audioEl.srcObject = remoteStream;

        const tryPlay = () => {
          if (!audioEl) return;
          audioEl.play().catch((err) => {
            console.warn(`[WebRTC] Autoplay blocked for ${targetUserId}, listening for user gesture:`, err);
            const unlockAudio = () => {
              audioEl?.play().catch(() => {});
              window.removeEventListener('click', unlockAudio);
              window.removeEventListener('keydown', unlockAudio);
              window.removeEventListener('touchstart', unlockAudio);
            };
            window.addEventListener('click', unlockAudio, { once: true });
            window.addEventListener('keydown', unlockAudio, { once: true });
            window.addEventListener('touchstart', unlockAudio, { once: true });
          });
        };

        tryPlay();

        event.track.onunmute = () => {
          tryPlay();
        };
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
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyserTimerRef.current = window.setInterval(() => {
          if (!localStreamRef.current) return;
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          const activeUser = currentUserRef.current;
          if (!audioTrack || !audioTrack.enabled) {
            if (lastSpeakingRef.current) {
              lastSpeakingRef.current = false;
              setIsSpeaking(false);
              if (activeUser) {
                sendWsMessage('webrtc:voice_state', {
                  userId: activeUser.userId,
                  fromUserId: activeUser.userId,
                  inVoiceChat: true,
                  isMuted: true,
                  isSpeaking: false,
                });
              }
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
            if (activeUser) {
              sendWsMessage('webrtc:voice_state', {
                userId: activeUser.userId,
                fromUserId: activeUser.userId,
                inVoiceChat: true,
                isMuted: false,
                isSpeaking: speakingNow,
              });
            }
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
              ? {
                  deviceId: { exact: selectedDeviceId },
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                }
              : {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
          video: false,
        });
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      } catch (micErr) {
        console.warn('Microphone hardware not available or denied, using silent fallback stream:', micErr);
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const dest = ctx.createMediaStreamDestination();
        stream = dest.stream;
        setPermissionNotice(
          'Microphone hardware not detected or blocked by browser — joined VC in listen/simulated-mic mode.'
        );
      }

      localStreamRef.current = stream;

      // Attach audio track to any existing peer connections
      for (const [, pc] of peerConnectionsRef.current.entries()) {
        const senders = pc.getSenders();
        stream.getAudioTracks().forEach((track) => {
          const alreadyAdded = senders.some((s) => s.track === track);
          if (!alreadyAdded) {
            pc.addTrack(track, stream);
          }
        });
      }

      inVoiceChatRef.current = true;
      setInVoiceChat(true);
      setIsMuted(false);
      setConnectionStatus('connected');

      startVoiceActivityDetector(stream);

      // Announce to both server and cloud-relay peers
      const joinPayload = {
        userId: currentUser.userId,
        fromUserId: currentUser.userId,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        inVoiceChat: true,
        isMuted: false,
        isSpeaking: false,
      };

      sendWsMessage('webrtc:join_vc', joinPayload);
      sendWsMessage('webrtc:user_joined_vc', joinPayload);
    } catch (err) {
      setConnectionStatus('permission_error');
      setPermissionNotice((err as Error).message || 'Could not access microphone.');
    }
  }, [currentUser, selectedDeviceId, sendWsMessage, startVoiceActivityDetector]);

  const leaveVoiceChat = useCallback(() => {
    const activeUser = currentUserRef.current;
    cleanupAllConnections();
    inVoiceChatRef.current = false;
    setInVoiceChat(false);
    setIsMuted(false);
    setIsSpeaking(false);
    setConnectionStatus('disconnected');
    setPermissionNotice(null);

    if (activeUser) {
      const leavePayload = {
        userId: activeUser.userId,
        fromUserId: activeUser.userId,
        inVoiceChat: false,
      };
      sendWsMessage('webrtc:leave_vc', leavePayload);
      sendWsMessage('webrtc:user_left_vc', leavePayload);
    }
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

    const activeUser = currentUserRef.current;
    if (activeUser) {
      sendWsMessage('webrtc:voice_state', {
        userId: activeUser.userId,
        fromUserId: activeUser.userId,
        inVoiceChat: true,
        isMuted: nextMuted,
        isSpeaking: false,
      });
    }
  }, [isMuted, sendWsMessage]);

  // Simulate speaking pulse button for testing or users without physical mic hardware
  const triggerTestSpeakingPulse = useCallback(() => {
    const activeUser = currentUserRef.current;
    if (!inVoiceChatRef.current || isMuted || !activeUser) return;
    setIsSpeaking(true);
    sendWsMessage('webrtc:voice_state', {
      userId: activeUser.userId,
      fromUserId: activeUser.userId,
      inVoiceChat: true,
      isMuted: false,
      isSpeaking: true,
    });
    setTimeout(() => {
      setIsSpeaking(false);
      sendWsMessage('webrtc:voice_state', {
        userId: activeUser.userId,
        fromUserId: activeUser.userId,
        inVoiceChat: true,
        isMuted: false,
        isSpeaking: false,
      });
    }, 2200);
  }, [isMuted, sendWsMessage]);

  // Handle incoming WebRTC signaling events from WebSocket or Cloud Relay
  const handleSignalingEvent = useCallback(
    async (type: string, payload: any) => {
      const activeUser = currentUserRef.current;
      if (!inVoiceChatRef.current || !activeUser) return;

      // Filter targeted signaling messages
      if (payload?.targetUserId && payload.targetUserId !== activeUser.userId) {
        return;
      }

      if (type === 'webrtc:user_joined_vc' || type === 'webrtc:join_vc') {
        const newPeerId = payload?.userId || payload?.fromUserId;
        if (!newPeerId || newPeerId === activeUser.userId) return;

        try {
          const pc = createOrGetPeerConnection(newPeerId);
          // Only create offer if pc is in stable state to prevent glare
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWsMessage('webrtc:offer', {
              fromUserId: activeUser.userId,
              targetUserId: newPeerId,
              sdp: pc.localDescription,
            });
          }
        } catch (e) {
          console.warn('[WebRTC] Offer creation error:', e);
        }
      } else if (type === 'webrtc:offer') {
        const { fromUserId, sdp } = payload || {};
        if (!fromUserId || !sdp || fromUserId === activeUser.userId) return;

        try {
          const pc = createOrGetPeerConnection(fromUserId);
          // Glare handling: if not stable, polite peer rolls back to accept offer
          if (pc.signalingState !== 'stable') {
            const isPolite = activeUser.userId < fromUserId;
            if (!isPolite) {
              console.warn('[WebRTC] Impolite peer ignoring colliding offer from', fromUserId);
              return;
            }
            await pc.setLocalDescription({ type: 'rollback' } as any);
          }

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));

          // Drain queued ICE candidates received before remote description
          const queued = iceCandidateQueuesRef.current.get(fromUserId) || [];
          iceCandidateQueuesRef.current.delete(fromUserId);
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.warn('[WebRTC] Error adding queued ICE candidate:', err);
            }
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWsMessage('webrtc:answer', {
            fromUserId: activeUser.userId,
            targetUserId: fromUserId,
            sdp: pc.localDescription,
          });
        } catch (e) {
          console.warn('[WebRTC] Answer error:', e);
        }
      } else if (type === 'webrtc:answer') {
        const { fromUserId, sdp } = payload || {};
        if (!fromUserId || !sdp || fromUserId === activeUser.userId) return;
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));

            // Drain queued ICE candidates received before remote description
            const queued = iceCandidateQueuesRef.current.get(fromUserId) || [];
            iceCandidateQueuesRef.current.delete(fromUserId);
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (err) {
                console.warn('[WebRTC] Error adding queued candidate on answer:', err);
              }
            }
          } catch (e) {
            console.warn('[WebRTC] setRemoteDescription answer error:', e);
          }
        }
      } else if (type === 'webrtc:ice_candidate') {
        const { fromUserId, candidate } = payload || {};
        if (!fromUserId || !candidate || fromUserId === activeUser.userId) return;
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
          // Queue candidate until remote description is set
          const q = iceCandidateQueuesRef.current.get(fromUserId) || [];
          q.push(candidate);
          iceCandidateQueuesRef.current.set(fromUserId, q);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn('[WebRTC] addIceCandidate error:', e);
          }
        }
      } else if (type === 'webrtc:user_left_vc' || type === 'webrtc:leave_vc') {
        const leftUserId = payload?.userId || payload?.fromUserId;
        if (leftUserId && leftUserId !== activeUser.userId) {
          cleanupPeer(leftUserId);
        }
      }
    },
    [cleanupPeer, createOrGetPeerConnection, sendWsMessage]
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
