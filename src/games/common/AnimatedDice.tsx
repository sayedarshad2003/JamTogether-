import React, { useEffect, useState } from 'react';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react';

interface AnimatedDiceProps {
  isRolling: boolean;
  diceValue: number | null;
  isMyTurn: boolean;
  onRoll: () => void;
  turnTimeoutSeconds?: number;
  turnStartedAt?: number;
  currentTurnPlayerName?: string;
}

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

export const AnimatedDice: React.FC<AnimatedDiceProps> = ({
  isRolling,
  diceValue,
  isMyTurn,
  onRoll,
  turnTimeoutSeconds = 45,
  turnStartedAt = Date.now(),
  currentTurnPlayerName,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(turnTimeoutSeconds);
  const [displayValue, setDisplayValue] = useState<number>(diceValue || 1);

  // Turn Countdown Timer
  useEffect(() => {
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
      const left = Math.max(0, turnTimeoutSeconds - elapsed);
      setSecondsRemaining(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [turnTimeoutSeconds, turnStartedAt]);

  // Rolling flutter effect
  useEffect(() => {
    if (!isRolling) {
      if (diceValue) setDisplayValue(diceValue);
      return;
    }

    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 85);

    return () => clearInterval(interval);
  }, [isRolling, diceValue]);

  const DiceIcon = DICE_ICONS[(displayValue || 1) - 1] || Dice1;
  const timerPercentage = Math.min(100, Math.max(0, (secondsRemaining / turnTimeoutSeconds) * 100));

  return (
    <div className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-lg backdrop-blur-md transition-colors w-full">
      {/* Turn Timer Progress Bar */}
      <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
          Turn Timer
        </span>
        <span className="tabular-nums font-bold text-amber-600 dark:text-amber-300">
          {secondsRemaining}s
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-500 ease-linear rounded-full ${
            secondsRemaining <= 10
              ? 'bg-rose-500'
              : secondsRemaining <= 20
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${timerPercentage}%` }}
        />
      </div>

      {/* 3D Interactive Dice Frame */}
      <div className="relative my-1">
        <button
          type="button"
          onClick={isMyTurn && !isRolling ? onRoll : undefined}
          disabled={!isMyTurn || isRolling}
          className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-amber-100 dark:from-amber-100 dark:via-white dark:to-amber-200 border-3 border-amber-300 shadow-md shadow-amber-500/20 text-slate-900 transition-all duration-200 ${
            isRolling
              ? 'animate-bounce rotate-12 scale-110'
              : isMyTurn
              ? 'hover:scale-105 cursor-pointer ring-4 ring-amber-400/50 active:scale-95'
              : 'opacity-85'
          }`}
          title={isMyTurn ? 'Tap to Roll Dice!' : undefined}
        >
          <DiceIcon className="w-12 h-12 sm:w-14 sm:h-14 text-slate-800 stroke-[2.4]" />
        </button>

        {diceValue === 6 && !isRolling && (
          <div className="absolute -top-2.5 -right-2 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold shadow-md animate-bounce border border-amber-300">
            BONUS ROLL!
          </div>
        )}
      </div>

      {/* Roll Action Button */}
      <div className="mt-3 w-full">
        {isMyTurn ? (
          <button
            type="button"
            onClick={onRoll}
            disabled={isRolling}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm tracking-wide uppercase transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
              isRolling
                ? 'bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400 cursor-not-allowed opacity-75'
                : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/25 ring-2 ring-amber-300/60'
            }`}
          >
            {isRolling ? 'Rolling...' : '🎲 TAP TO ROLL'}
          </button>
        ) : (
          <div className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-center text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            Waiting for {currentTurnPlayerName || 'player'}...
          </div>
        )}
      </div>
    </div>
  );
};
