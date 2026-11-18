import React from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  Radio,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { RoomMember, UserProfile } from '../types/jam.ts';

interface VoiceChatPanelProps {
  members: RoomMember[];
  currentUser: UserProfile | null;
  inVoiceChat: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'permission_error';
  permissionNotice: string | null;
  audioDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  peerStatuses: Record<string, RTCPeerConnectionState>;
  onJoinVC: () => void;
  onLeaveVC: () => void;
  onToggleMute: () => void;
  onTestSpeakingPulse: () => void;
}

export function VoiceChatPanel({
  members,
  currentUser,
  inVoiceChat,
  isMuted,
  isSpeaking,
  connectionStatus,
  permissionNotice,
  audioDevices,
  selectedDeviceId,
  onSelectDevice,
  peerStatuses,
  onJoinVC,
  onLeaveVC,
  onToggleMute,
  onTestSpeakingPulse,
}: VoiceChatPanelProps) {
  const vcParticipants = members.filter(
    (m) => m.inVoiceChat || (m.userId === currentUser?.userId && inVoiceChat)
  );

  return (
    <div className="rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Live Voice Chat (WebRTC P2P Mesh)
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Independent of music playback · {vcParticipants.length} active in voice channel · Status:{' '}
            <span className="font-mono">{connectionStatus.toUpperCase()}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!inVoiceChat ? (
            <button
              type="button"
              onClick={onJoinVC}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition-all shadow-sm whitespace-nowrap"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Join Voice Chat</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                  isMuted
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-100 dark:bg-[#181B28] border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Unmute Mic</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Mute Mic</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onTestSpeakingPulse}
                disabled={isMuted}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 transition-colors whitespace-nowrap"
                title="Test voice activity indicator"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Test Mic Activity</span>
              </button>

              <button
                type="button"
                onClick={onLeaveVC}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 transition-colors whitespace-nowrap"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Disconnect VC</span>
              </button>
            </>
          )}
        </div>
      </div>

      {permissionNotice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{permissionNotice}</span>
        </div>
      )}

      {/* Microphone Input Selector when multiple devices exist */}
      {inVoiceChat && audioDevices.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Settings2 className="w-3.5 h-3.5 shrink-0" />
          <span>Input Device:</span>
          <select
            value={selectedDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="default">System Default Microphone</option>
            {audioDevices.map((dev, idx) => (
              <option key={dev.deviceId || idx} value={dev.deviceId}>
                {dev.label || `Microphone ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Voice Participants Grid */}
      {vcParticipants.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181B28]/60 border border-slate-200/70 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No one is in the voice channel right now. Click <strong>Join Voice Chat</strong> to talk
            while listening to music.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {vcParticipants.map((participant) => {
            const isSelf = participant.userId === currentUser?.userId;
            const effectiveMuted = isSelf ? isMuted : participant.isMuted;
            const effectiveSpeaking = isSelf ? isSpeaking : participant.isSpeaking;
            const peerState = isSelf
              ? 'local'
              : peerStatuses[participant.userId] || 'connected';

            return (
              <div
                key={participant.userId}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                  effectiveSpeaking
                    ? 'bg-violet-500/10 border-violet-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-[#181B28] border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`relative w-10 h-10 rounded-full p-0.5 transition-transform ${
                      effectiveSpeaking
                        ? 'ring-2 ring-violet-500 scale-105'
                        : 'ring-1 ring-slate-200 dark:ring-slate-700'
                    }`}
                  >
                    <img
                      src={participant.avatarUrl}
                      alt={participant.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {participant.displayName} {isSelf ? '(You)' : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {effectiveSpeaking
                        ? 'Speaking live...'
                        : effectiveMuted
                        ? 'Mic Muted'
                        : `WebRTC ${peerState}`}
                    </p>
                  </div>
                </div>

                {/* Speaking Waveform & Mic Status */}
                <div className="flex items-center gap-2 shrink-0">
                  {effectiveSpeaking && !effectiveMuted && (
                    <div className="flex items-end gap-0.5 h-4 px-1" aria-label="Speaking">
                      <span className="w-1 h-2.5 bg-violet-500 rounded-full animate-bounce" />
                      <span className="w-1 h-4 bg-blue-500 rounded-full animate-pulse" />
                      <span className="w-1 h-2 bg-violet-400 rounded-full animate-bounce" />
                    </div>
                  )}
                  <div
                    className={`p-1.5 rounded-lg ${
                      effectiveMuted
                        ? 'bg-red-500/15 text-red-500'
                        : 'bg-emerald-500/15 text-emerald-500'
                    }`}
                  >
                    {effectiveMuted ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
