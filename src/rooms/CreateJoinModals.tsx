import React, { useState, useEffect } from 'react';
import { X, Radio, Lock, Globe, Hash, ArrowRight } from 'lucide-react';
import { apiRequest } from '../aws-services/apiClient.ts';
import { JamRoom } from '../types/jam.ts';
import { globalRoomDiscovery } from '../realtime/globalDiscovery.ts';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (room: JamRoom) => void;
}

export function CreateRoomModal({ isOpen, onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [genreTag, setGenreTag] = useState('Electronic / Indie');
  const [isPrivate, setIsPrivate] = useState(false);
  const [initialSong, setInitialSong] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ room: JamRoom }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          genreTag,
          isPrivate,
          initialSong: initialSong.trim(),
        }),
      });
      setName('');
      setDescription('');
      setInitialSong('');
      onCreated(res.room);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Create a Listening Jam Room
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Room Name
            </label>
            <input
              type="text"
              placeholder="e.g., Late Night Vinyl & Synth Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="What are we listening to tonight?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Genre / Vibe
              </label>
              <input
                type="text"
                value={genreTag}
                onChange={(e) => setGenreTag(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Room Visibility
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#181B28]">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    !isPrivate
                      ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    isPrivate
                      ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Opening Track (Optional)
            </label>
            <input
              type="text"
              value={initialSong}
              onChange={(e) => setInitialSong(e.target.value)}
              placeholder="Paste YouTube link / song name, or leave blank to choose inside room"
              className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Leave blank to start with a clean room and queue any song live inside.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shadow-sm"
            >
              {loading ? 'Provisioning Room...' : 'Launch Jam Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoined: (room: JamRoom) => void;
}

export function JoinRoomModal({ isOpen, onClose, onJoined }: JoinRoomModalProps) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [discoveredRooms, setDiscoveredRooms] = useState<JamRoom[]>([]);

  useEffect(() => {
    if (isOpen) {
      setDiscoveredRooms(globalRoomDiscovery.getDiscoveredRooms());
      const unsub = globalRoomDiscovery.subscribe((rooms) => {
        setDiscoveredRooms(rooms);
      });
      return unsub;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleJoin = async (codeToJoin: string) => {
    setError(null);
    setLoading(true);
    try {
      // Allow pasting full invite URL or room code
      let cleanCode = codeToJoin.trim();
      const urlMatch = cleanCode.match(/[?&]room=([^&]+)/);
      if (urlMatch) {
        cleanCode = urlMatch[1];
      }
      const res = await apiRequest<{ room: JamRoom }>('/api/rooms/join-code', {
        method: 'POST',
        body: JSON.stringify({ roomCode: cleanCode }),
      });
      setRoomCode('');
      onJoined(res.room);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Hash className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Join Jam with Room Code
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin(roomCode);
          }}
          className="p-6 space-y-4"
        >
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Enter Room Code or Invite Link
            </label>
            <input
              type="text"
              placeholder="e.g. JAM-7701 or paste invite link"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            {discoveredRooms.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Live Rooms Discovered from Other Devices:
                </p>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {discoveredRooms.map((r) => (
                    <button
                      key={r.roomId}
                      type="button"
                      onClick={() => handleJoin(r.roomCode)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#181B28] hover:bg-violet-500/15 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 transition-colors"
                    >
                      <span className="font-mono font-bold text-violet-600 dark:text-violet-400">
                        {r.roomCode}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate max-w-[120px]">
                        {r.name}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ask the room host for their 4-6 character Room Code (e.g. JAM-7701) or paste the full room invite link.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl transition-all shadow-sm"
          >
            {loading ? 'Connecting to Room...' : 'Join Jam Session'}
          </button>
        </form>
      </div>
    </div>
  );
}
