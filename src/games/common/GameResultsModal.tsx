import React, { useEffect } from 'react';
import { Crown, RotateCcw, Trophy, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GameResultsRank } from '../types';

interface GameResultsModalProps {
  isOpen: boolean;
  winnerName: string;
  winnerAvatarUrl?: string;
  isMeWinner: boolean;
  isHost: boolean;
  gameTitle: string;
  rankings: GameResultsRank[];
  onRematch: () => void;
  onClose: () => void;
}

export const GameResultsModal: React.FC<GameResultsModalProps> = ({
  isOpen,
  winnerName,
  winnerAvatarUrl,
  isMeWinner,
  isHost,
  gameTitle,
  rankings,
  onRematch,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    // Trigger celebratory confetti burst
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#10B981', '#EC4899', '#6366F1', '#3B82F6'],
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 350);
    } catch {}
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:via-[#0B1528] dark:to-slate-950 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-amber-500/20 text-center transition-colors">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Victory Crown & Trophy Badge */}
        <div className="relative mx-auto mb-3 w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/40 border-4 border-amber-200">
          <Trophy className="w-8 h-8 text-slate-950" />
          <Crown className="w-6 h-6 text-amber-300 absolute -top-3.5 -right-1" />
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-300 tracking-tight">
          {isMeWinner ? 'Victory is Yours! 👑' : `${winnerName} Wins! 🏆`}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {gameTitle} Champion
        </p>

        {/* Leaderboard Podium */}
        <div className="my-5 space-y-2 text-left">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
            Match Standings
          </span>
          {rankings.map((p, idx) => {
            const isFirst = idx === 0;
            return (
              <div
                key={p.playerId}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  isFirst
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-400 shadow-sm shadow-amber-500/10'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[10px] ${
                      isFirst
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      {p.scoreText}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-400">
                  {p.details}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 mt-5">
          {isHost ? (
            <button
              type="button"
              onClick={onRematch}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-md shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again (Rematch)</span>
            </button>
          ) : (
            <div className="text-xs text-amber-600 dark:text-amber-300 font-medium italic py-1">
              Waiting for host to start rematch...
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
