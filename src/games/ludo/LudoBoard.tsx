import React, { useMemo } from 'react';
import {
  canTokenMove,
  COLOR_START_INDEX,
  getTokenCoord,
  LUDO_HOME_COLUMNS,
  LUDO_TRACK_COORDS,
  SAFE_TRACK_INDEXES,
} from './ludoRules';
import { GamePlayer, LudoColor, LudoPlayerState, LudoToken } from '../types';

interface LudoBoardProps {
  players: GamePlayer[];
  playerStates: Record<string, LudoPlayerState>;
  currentTurnPlayerId: string;
  myPlayerId: string;
  diceValue: number | null;
  hasRolled: boolean;
  onSelectToken: (tokenId: number) => void;
}

const COLOR_STYLES: Record<
  LudoColor,
  {
    bg: string;
    lightBg: string;
    border: string;
    text: string;
    tokenBg: string;
    tokenBorder: string;
    tokenGlow: string;
  }
> = {
  red: {
    bg: 'bg-rose-500',
    lightBg: 'bg-rose-100 dark:bg-rose-950/40',
    border: 'border-rose-600',
    text: 'text-rose-600 dark:text-rose-400',
    tokenBg: 'bg-gradient-to-br from-rose-400 to-rose-600 text-white',
    tokenBorder: 'border-rose-200',
    tokenGlow: 'shadow-[0_0_12px_rgba(244,63,94,0.8)]',
  },
  green: {
    bg: 'bg-emerald-500',
    lightBg: 'bg-emerald-100 dark:bg-emerald-950/40',
    border: 'border-emerald-600',
    text: 'text-emerald-600 dark:text-emerald-400',
    tokenBg: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white',
    tokenBorder: 'border-emerald-200',
    tokenGlow: 'shadow-[0_0_12px_rgba(16,185,129,0.8)]',
  },
  yellow: {
    bg: 'bg-amber-500',
    lightBg: 'bg-amber-100 dark:bg-amber-950/40',
    border: 'border-amber-600',
    text: 'text-amber-600 dark:text-amber-400',
    tokenBg: 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-900',
    tokenBorder: 'border-amber-200',
    tokenGlow: 'shadow-[0_0_12px_rgba(245,158,11,0.8)]',
  },
  blue: {
    bg: 'bg-blue-500',
    lightBg: 'bg-blue-100 dark:bg-blue-950/40',
    border: 'border-blue-600',
    text: 'text-blue-600 dark:text-blue-400',
    tokenBg: 'bg-gradient-to-br from-blue-400 to-blue-600 text-white',
    tokenBorder: 'border-blue-200',
    tokenGlow: 'shadow-[0_0_12px_rgba(59,130,246,0.8)]',
  },
};

export const LudoBoard: React.FC<LudoBoardProps> = ({
  players,
  playerStates,
  currentTurnPlayerId,
  myPlayerId,
  diceValue,
  hasRolled,
  onSelectToken,
}) => {
  const isMyTurn = currentTurnPlayerId === myPlayerId;
  const myPlayerState = playerStates[myPlayerId];

  // Check which of my tokens are movable
  const movableTokenIds = useMemo(() => {
    if (!isMyTurn || !hasRolled || !diceValue || !myPlayerState) return new Set<number>();
    const ids = new Set<number>();
    myPlayerState.tokens.forEach((t) => {
      if (canTokenMove(t, diceValue)) {
        ids.add(t.id);
      }
    });
    return ids;
  }, [isMyTurn, hasRolled, diceValue, myPlayerState]);

  // Aggregate all tokens across players
  const allTokensWithPlayer = useMemo(() => {
    const list: { token: LudoToken; player: GamePlayer }[] = [];
    players.forEach((p) => {
      const state = playerStates[p.id];
      if (state) {
        state.tokens.forEach((t) => {
          list.push({ token: t, player: p });
        });
      }
    });
    return list;
  }, [players, playerStates]);

  return (
    <div className="relative w-full aspect-square max-w-[min(94vw,68vh,620px)] mx-auto select-none rounded-3xl p-2 sm:p-3 bg-amber-50/70 dark:bg-gradient-to-b dark:from-slate-900 dark:via-[#0B1528] dark:to-[#070D1A] border-2 border-amber-500/40 dark:border-amber-500/25 shadow-xl dark:shadow-2xl dark:shadow-black/80 transition-colors">
      {/* 15x15 Ludo Board Grid Container */}
      <div className="relative w-full h-full rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-inner">
        {/* Four Corner Home Yards */}
        {/* Top-Left: Red Yard (cols 0..5, rows 0..5) */}
        <div
          className="absolute bg-rose-500 p-2 sm:p-3.5 flex items-center justify-center border-r-2 border-b-2 border-slate-400 dark:border-slate-800"
          style={{ width: '40%', height: '40%', top: 0, left: 0 }}
        >
          <div className="w-full h-full bg-white dark:bg-slate-900 rounded-xl p-2 sm:p-3 grid grid-cols-2 grid-rows-2 gap-2 shadow-inner">
            <div className="rounded-full bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-400 flex items-center justify-center" />
            <div className="rounded-full bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-400 flex items-center justify-center" />
            <div className="rounded-full bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-400 flex items-center justify-center" />
            <div className="rounded-full bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-400 flex items-center justify-center" />
          </div>
        </div>

        {/* Top-Right: Green Yard (cols 9..14, rows 0..5) */}
        <div
          className="absolute bg-emerald-500 p-2 sm:p-3.5 flex items-center justify-center border-l-2 border-b-2 border-slate-400 dark:border-slate-800"
          style={{ width: '40%', height: '40%', top: 0, right: 0 }}
        >
          <div className="w-full h-full bg-white dark:bg-slate-900 rounded-xl p-2 sm:p-3 grid grid-cols-2 grid-rows-2 gap-2 shadow-inner">
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 flex items-center justify-center" />
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 flex items-center justify-center" />
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 flex items-center justify-center" />
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 flex items-center justify-center" />
          </div>
        </div>

        {/* Bottom-Right: Yellow Yard (cols 9..14, rows 9..14) */}
        <div
          className="absolute bg-amber-500 p-2 sm:p-3.5 flex items-center justify-center border-l-2 border-t-2 border-slate-400 dark:border-slate-800"
          style={{ width: '40%', height: '40%', bottom: 0, right: 0 }}
        >
          <div className="w-full h-full bg-white dark:bg-slate-900 rounded-xl p-2 sm:p-3 grid grid-cols-2 grid-rows-2 gap-2 shadow-inner">
            <div className="rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center" />
            <div className="rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center" />
            <div className="rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center" />
            <div className="rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center" />
          </div>
        </div>

        {/* Bottom-Left: Blue Yard (cols 0..5, rows 9..14) */}
        <div
          className="absolute bg-blue-500 p-2 sm:p-3.5 flex items-center justify-center border-r-2 border-t-2 border-slate-400 dark:border-slate-800"
          style={{ width: '40%', height: '40%', bottom: 0, left: 0 }}
        >
          <div className="w-full h-full bg-white dark:bg-slate-900 rounded-xl p-2 sm:p-3 grid grid-cols-2 grid-rows-2 gap-2 shadow-inner">
            <div className="rounded-full bg-blue-100 dark:bg-blue-950/60 border-2 border-blue-400 flex items-center justify-center" />
            <div className="rounded-full bg-blue-100 dark:bg-blue-950/60 border-2 border-blue-400 flex items-center justify-center" />
            <div className="rounded-full bg-blue-100 dark:bg-blue-950/60 border-2 border-blue-400 flex items-center justify-center" />
            <div className="rounded-full bg-blue-100 dark:bg-blue-950/60 border-2 border-blue-400 flex items-center justify-center" />
          </div>
        </div>

        {/* Center Triangular Victory Hub (cols 6..8, rows 6..8) */}
        <div
          className="absolute border border-slate-300 dark:border-slate-800 flex items-center justify-center overflow-hidden"
          style={{ width: '20%', height: '20%', top: '40%', left: '40%' }}
        >
          {/* SVG 4 Colored Triangles */}
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Top Green triangle */}
            <polygon points="0,0 100,0 50,50" fill="#10B981" />
            {/* Right Yellow triangle */}
            <polygon points="100,0 100,100 50,50" fill="#F59E0B" />
            {/* Bottom Blue triangle */}
            <polygon points="100,100 0,100 50,50" fill="#3B82F6" />
            {/* Left Red triangle */}
            <polygon points="0,100 0,0 50,50" fill="#F43F5E" />
            {/* Center Crown Hub */}
            <circle cx="50" cy="50" r="14" fill="#1E293B" stroke="#FDE047" strokeWidth="2" />
            <text
              x="50"
              y="54"
              textAnchor="middle"
              fontSize="12"
              fill="#FDE047"
              fontWeight="bold"
            >
              👑
            </text>
          </svg>
        </div>

        {/* Render 52 Perimeter Track Cells */}
        {LUDO_TRACK_COORDS.map((coord, idx) => {
          const isSafe = SAFE_TRACK_INDEXES.has(idx);
          const isRedStart = idx === COLOR_START_INDEX.red;
          const isGreenStart = idx === COLOR_START_INDEX.green;
          const isYellowStart = idx === COLOR_START_INDEX.yellow;
          const isBlueStart = idx === COLOR_START_INDEX.blue;

          let cellBg = 'bg-white dark:bg-slate-900';
          if (isRedStart) cellBg = 'bg-rose-500 text-white';
          else if (isGreenStart) cellBg = 'bg-emerald-500 text-white';
          else if (isYellowStart) cellBg = 'bg-amber-500 text-slate-950';
          else if (isBlueStart) cellBg = 'bg-blue-500 text-white';
          else if (isSafe) cellBg = 'bg-amber-100/90 dark:bg-amber-950/40 text-amber-600';

          return (
            <div
              key={`track-${idx}`}
              className={`absolute border border-slate-200 dark:border-slate-800/80 flex items-center justify-center font-bold text-[8px] sm:text-[10px] ${cellBg}`}
              style={{
                width: `${100 / 15}%`,
                height: `${100 / 15}%`,
                left: `${coord.col * (100 / 15)}%`,
                top: `${coord.row * (100 / 15)}%`,
              }}
            >
              {isSafe && <span className="text-[9px] sm:text-xs">★</span>}
            </div>
          );
        })}

        {/* Render Colored Home Columns (5 steps each) */}
        {(['red', 'green', 'yellow', 'blue'] as LudoColor[]).map((c) => {
          const colList = LUDO_HOME_COLUMNS[c];
          const style = COLOR_STYLES[c];
          return colList.map((coord, idx) => (
            <div
              key={`home-${c}-${idx}`}
              className={`absolute border border-slate-200 dark:border-slate-800/80 flex items-center justify-center ${style.bg}`}
              style={{
                width: `${100 / 15}%`,
                height: `${100 / 15}%`,
                left: `${coord.col * (100 / 15)}%`,
                top: `${coord.row * (100 / 15)}%`,
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
            </div>
          ));
        })}

        {/* Dynamic Tokens Overlay */}
        {allTokensWithPlayer.map(({ token, player }) => {
          const coord = getTokenCoord(token);
          const isMine = player.id === myPlayerId;
          const isMovable = isMine && movableTokenIds.has(token.id);
          const style = COLOR_STYLES[token.color];

          return (
            <button
              key={`token-${player.id}-${token.id}`}
              type="button"
              onClick={isMovable ? () => onSelectToken(token.id) : undefined}
              disabled={!isMovable}
              style={{
                left: `${coord.xPercent}%`,
                top: `${coord.yPercent}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute z-30 transition-all duration-300 flex items-center justify-center rounded-full ${
                style.tokenBg
              } border-2 ${style.tokenBorder} shadow-md ${
                isMovable
                  ? 'w-6 h-6 sm:w-7 sm:h-7 ring-4 ring-amber-300 animate-bounce cursor-pointer scale-110 z-40'
                  : 'w-5 h-5 sm:w-6 sm:h-6 opacity-95'
              }`}
              title={`${player.name} Token #${token.id + 1} ${
                isMovable ? '(Click to move!)' : ''
              }`}
            >
              <span className="font-mono text-[9px] sm:text-[10px] font-black">
                {token.id + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
