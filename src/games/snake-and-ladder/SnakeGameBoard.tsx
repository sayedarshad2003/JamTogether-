import React, { useMemo } from 'react';
import {
  generateZigzagBoardGrid,
  getSquareCoordinates,
} from './boardRules';
import {
  GamePlayer,
  PlayerTokenColor,
  SnakeBoardConfig,
  SnakePlayerState,
} from '../types';

interface SnakeGameBoardProps {
  boardConfig: SnakeBoardConfig;
  players: GamePlayer[];
  playerStates: Record<string, SnakePlayerState>;
  currentTurnPlayerId: string;
  activeMovingPlayerId: string | null;
  activeTransitionId: string | null;
}

const TOKEN_COLOR_CONFIG: Record<
  PlayerTokenColor,
  { bg: string; border: string; glow: string; text: string; ring: string }
> = {
  emerald: {
    bg: 'bg-emerald-500',
    border: 'border-emerald-200',
    glow: 'shadow-[0_0_16px_rgba(16,185,129,0.7)]',
    text: 'text-emerald-950',
    ring: 'ring-emerald-400',
  },
  amber: {
    bg: 'bg-amber-500',
    border: 'border-amber-200',
    glow: 'shadow-[0_0_16px_rgba(245,158,11,0.7)]',
    text: 'text-amber-950',
    ring: 'ring-amber-400',
  },
  crimson: {
    bg: 'bg-rose-500',
    border: 'border-rose-200',
    glow: 'shadow-[0_0_16px_rgba(244,63,94,0.7)]',
    text: 'text-rose-950',
    ring: 'ring-rose-400',
  },
  azure: {
    bg: 'bg-cyan-500',
    border: 'border-cyan-200',
    glow: 'shadow-[0_0_16px_rgba(6,182,212,0.7)]',
    text: 'text-cyan-950',
    ring: 'ring-cyan-400',
  },
};

export const SnakeGameBoard: React.FC<SnakeGameBoardProps> = ({
  boardConfig,
  players,
  playerStates,
  currentTurnPlayerId,
  activeMovingPlayerId,
  activeTransitionId,
}) => {
  const gridCells = useMemo(() => generateZigzagBoardGrid(), []);

  // Compute token positions and cluster offsets
  const tokensBySquare = useMemo(() => {
    const map = new Map<number, GamePlayer[]>();
    players.forEach((p) => {
      const pos = playerStates[p.id]?.position || 1;
      const list = map.get(pos) || [];
      list.push(p);
      map.set(pos, list);
    });
    return map;
  }, [players, playerStates]);

  const getSvgCoord = (sq: number) => {
    const c = getSquareCoordinates(sq);
    return {
      x: c.centerXPercent * 10,
      y: c.centerYPercent * 10,
    };
  };

  return (
    <div className="relative w-full aspect-square max-w-[min(94vw,68vh,620px)] mx-auto select-none rounded-3xl p-2 sm:p-3 bg-amber-50/70 dark:bg-gradient-to-b dark:from-slate-900 dark:via-[#0B1528] dark:to-[#070D1A] border-2 border-amber-500/40 dark:border-amber-500/25 shadow-xl dark:shadow-2xl dark:shadow-black/80 transition-colors">
      {/* Outer Decorative Gold Trim */}
      <div className="absolute inset-1 rounded-2xl border border-amber-400/30 dark:border-amber-400/15 pointer-events-none" />

      {/* 10x10 Board Grid Cells */}
      <div className="grid grid-cols-10 grid-rows-10 w-full h-full rounded-xl overflow-hidden border border-amber-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950 shadow-inner">
        {gridCells.map((cell) => {
          const isHundred = cell.square === 100;
          const isOne = cell.square === 1;
          const isAltCell = (cell.visualCol + cell.visualRow) % 2 === 0;

          const snakeHead = boardConfig.snakes.find((s) => s.head === cell.square);
          const ladderBottom = boardConfig.ladders.find((l) => l.bottom === cell.square);
          const snakeTail = boardConfig.snakes.find((s) => s.tail === cell.square);
          const ladderTop = boardConfig.ladders.find((l) => l.top === cell.square);

          let tileBg = isAltCell
            ? 'bg-slate-100/70 text-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
            : 'bg-white text-slate-600 dark:bg-slate-900/60 dark:text-slate-400';

          if (isHundred) {
            tileBg =
              'bg-gradient-to-br from-amber-300/40 via-yellow-100/70 to-amber-50 dark:from-amber-500/35 dark:via-yellow-500/25 dark:to-slate-900 text-amber-800 dark:text-amber-300 font-extrabold';
          } else if (isOne) {
            tileBg =
              'bg-gradient-to-br from-emerald-300/40 via-emerald-100/70 to-white dark:from-emerald-600/30 dark:via-slate-900 dark:to-slate-900 text-emerald-800 dark:text-emerald-300 font-extrabold';
          } else if (snakeHead) {
            tileBg =
              'bg-rose-100/80 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 font-medium';
          } else if (ladderBottom) {
            tileBg =
              'bg-amber-100/80 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 font-medium';
          }

          return (
            <div
              key={cell.square}
              className={`relative flex flex-col justify-between p-0.5 sm:p-1 border-[0.5px] border-amber-100/70 dark:border-slate-800/40 transition-colors ${tileBg}`}
            >
              {/* Square Number */}
              <div className="flex items-center justify-between w-full leading-none">
                <span className="font-mono text-[7px] sm:text-[11px] font-bold tabular-nums tracking-tighter opacity-80">
                  {cell.square}
                </span>

                {isHundred && (
                  <span className="text-[9px] sm:text-xs font-bold text-amber-500 dark:text-amber-300">
                    👑
                  </span>
                )}
                {isOne && (
                  <span className="text-[7px] sm:text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    GO
                  </span>
                )}
              </div>

              {/* Special Square Indicators */}
              <div className="mt-auto flex items-center justify-end gap-0.5">
                {snakeHead && (
                  <span
                    className="text-[6px] sm:text-[8px] font-mono px-0.5 py-0.1 rounded bg-rose-200/90 dark:bg-rose-950/80 text-rose-900 dark:text-rose-300 border border-rose-300 dark:border-rose-800/40 font-bold"
                    title={`Snake head: slides down to square ${snakeHead.tail}`}
                  >
                    🐍{snakeHead.tail}
                  </span>
                )}
                {ladderBottom && (
                  <span
                    className="text-[6px] sm:text-[8px] font-mono px-0.5 py-0.1 rounded bg-amber-200/90 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/40 font-bold"
                    title={`Ladder bottom: climbs up to square ${ladderBottom.top}`}
                  >
                    🪜{ladderBottom.top}
                  </span>
                )}
                {snakeTail && !snakeHead && (
                  <span className="hidden sm:inline text-[6px] text-rose-500/70 dark:text-rose-400/60 font-mono">
                    ▼{snakeTail.head}
                  </span>
                )}
                {ladderTop && !ladderBottom && (
                  <span className="hidden sm:inline text-[6px] text-amber-600/70 dark:text-amber-400/60 font-mono">
                    ▲{ladderTop.bottom}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SVG Vector Layer: Detailed Wooden Ladders & Sinuous Snakes */}
      <svg
        viewBox="0 0 1000 1000"
        className="absolute inset-0 w-full h-full pointer-events-none p-2 sm:p-3"
      >
        <defs>
          <filter id="slSnakeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="4" stdDeviation="3.5" floodColor="#000" floodOpacity="0.65" />
          </filter>
        </defs>

        {/* 1. Ladders */}
        {boardConfig.ladders.map((ladder) => {
          const start = getSvgCoord(ladder.bottom);
          const end = getSvgCoord(ladder.top);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);

          const railOffset = 13;
          const px = -Math.sin(angle) * railOffset;
          const py = Math.cos(angle) * railOffset;

          const r1Start = { x: start.x + px, y: start.y + py };
          const r1End = { x: end.x + px, y: end.y + py };
          const r2Start = { x: start.x - px, y: start.y - py };
          const r2End = { x: end.x - px, y: end.y - py };

          const rungCount = Math.max(3, Math.floor(length / 28));
          const rungs: { x1: number; y1: number; x2: number; y2: number }[] = [];
          for (let i = 1; i <= rungCount; i++) {
            const t = i / (rungCount + 1);
            rungs.push({
              x1: r1Start.x + (r1End.x - r1Start.x) * t,
              y1: r1Start.y + (r1End.y - r1Start.y) * t,
              x2: r2Start.x + (r2End.x - r2Start.x) * t,
              y2: r2Start.y + (r2End.y - r2Start.y) * t,
            });
          }

          const isActive = activeTransitionId === ladder.id;

          return (
            <g
              key={ladder.id}
              className={`transition-all duration-300 ${
                isActive
                  ? 'filter drop-shadow-[0_0_18px_rgba(245,158,11,0.9)] opacity-100'
                  : 'opacity-85'
              }`}
            >
              {/* Rails */}
              <line
                x1={r1Start.x}
                y1={r1Start.y}
                x2={r1End.x}
                y2={r1End.y}
                stroke={isActive ? '#FEF08A' : ladder.railColor}
                strokeWidth={isActive ? '6' : '4.5'}
                strokeLinecap="round"
              />
              <line
                x1={r2Start.x}
                y1={r2Start.y}
                x2={r2End.x}
                y2={r2End.y}
                stroke={isActive ? '#FEF08A' : ladder.railColor}
                strokeWidth={isActive ? '6' : '4.5'}
                strokeLinecap="round"
              />

              {/* Rungs */}
              {rungs.map((r, idx) => (
                <line
                  key={idx}
                  x1={r.x1}
                  y1={r.y1}
                  x2={r.x2}
                  y2={r.y2}
                  stroke={isActive ? '#FEF3C7' : '#D97706'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              ))}

              <circle cx={r1Start.x} cy={r1Start.y} r="3.5" fill="#FCD34D" />
              <circle cx={r2Start.x} cy={r2Start.y} r="3.5" fill="#FCD34D" />
              <circle cx={r1End.x} cy={r1End.y} r="3.5" fill="#FCD34D" />
              <circle cx={r2End.x} cy={r2End.y} r="3.5" fill="#FCD34D" />
            </g>
          );
        })}

        {/* 2. Snakes */}
        {boardConfig.snakes.map((snake) => {
          const head = getSvgCoord(snake.head);
          const tail = getSvgCoord(snake.tail);

          const dx = tail.x - head.x;
          const dy = tail.y - head.y;
          const curvature = 70;
          const cp1x = head.x + dx * 0.25 - dy * (curvature / 400);
          const cp1y = head.y + dy * 0.25 + dx * (curvature / 400);
          const cp2x = head.x + dx * 0.75 + dy * (curvature / 400);
          const cp2y = head.y + dy * 0.75 - dx * (curvature / 400);

          const pathD = `M ${head.x} ${head.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tail.x} ${tail.y}`;
          const isActive = activeTransitionId === snake.id;
          const headAngle = Math.atan2(cp1y - head.y, cp1x - head.x);

          return (
            <g
              key={snake.id}
              filter="url(#slSnakeShadow)"
              className={`transition-all duration-300 ${
                isActive
                  ? 'filter drop-shadow-[0_0_20px_rgba(244,63,94,0.95)] opacity-100 scale-[1.02]'
                  : 'opacity-90'
              }`}
            >
              {/* Outer Silhouette */}
              <path
                d={pathD}
                fill="none"
                stroke={isActive ? '#FFE4E6' : snake.secondaryColor}
                strokeWidth={isActive ? '16' : '13'}
                strokeLinecap="round"
              />

              {/* Main Body */}
              <path
                d={pathD}
                fill="none"
                stroke={snake.primaryColor}
                strokeWidth="8"
                strokeLinecap="round"
              />

              {/* Belly Scale Accent */}
              <path
                d={pathD}
                fill="none"
                stroke={snake.bellyColor}
                strokeWidth="2"
                strokeDasharray="4 6"
                strokeLinecap="round"
              />

              {/* Head with Slit Eyes */}
              <g
                transform={`translate(${head.x}, ${head.y}) rotate(${
                  (headAngle * 180) / Math.PI + 180
                })`}
              >
                <path
                  d="M 10 0 L 19 -2.5 M 10 0 L 19 2.5"
                  stroke="#EF4444"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <ellipse
                  cx="0"
                  cy="0"
                  rx="12"
                  ry="8.5"
                  fill={snake.primaryColor}
                  stroke={snake.secondaryColor}
                  strokeWidth="1.8"
                />
                <ellipse cx="-2.5" cy="-4" rx="2.5" ry="1.5" fill="#FEF08A" />
                <ellipse cx="-2.5" cy="-4" rx="0.8" ry="1.5" fill="#000" />
                <ellipse cx="-2.5" cy="4" rx="2.5" ry="1.5" fill="#FEF08A" />
                <ellipse cx="-2.5" cy="4" rx="0.8" ry="1.5" fill="#000" />
                <circle cx="8" cy="0" r="3" fill={snake.secondaryColor} />
              </g>

              {/* Tail */}
              <circle cx={tail.x} cy={tail.y} r="4" fill={snake.secondaryColor} />
            </g>
          );
        })}
      </svg>

      {/* Dynamic Player Tokens */}
      <div className="absolute inset-0 w-full h-full pointer-events-none p-2 sm:p-3">
        {players.map((player) => {
          const currentPos = playerStates[player.id]?.position || 1;
          const coords = getSquareCoordinates(currentPos);
          const colorStyles =
            TOKEN_COLOR_CONFIG[player.tokenColor] || TOKEN_COLOR_CONFIG.emerald;
          const isCurrentTurn = player.id === currentTurnPlayerId;
          const isActivelyMoving = player.id === activeMovingPlayerId;

          // Offset if multiple tokens on same square
          const peersOnSquare = tokensBySquare.get(currentPos) || [];
          const myIdx = peersOnSquare.findIndex((p) => p.id === player.id);
          const totalPeers = peersOnSquare.length;

          let offsetX = 0;
          let offsetY = 0;
          if (totalPeers > 1) {
            const spread = 2.2;
            const angle = (myIdx / totalPeers) * 2 * Math.PI;
            offsetX = Math.cos(angle) * spread;
            offsetY = Math.sin(angle) * spread;
          }

          const leftPercent = coords.centerXPercent + offsetX;
          const topPercent = coords.centerYPercent + offsetY;

          return (
            <div
              key={player.id}
              style={{
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute transition-all duration-200 ease-out z-20 flex flex-col items-center"
            >
              {/* Token Avatar Badge */}
              <div
                className={`relative w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs border-2 shadow-md transition-transform ${
                  colorStyles.bg
                } ${colorStyles.border} ${colorStyles.text} ${
                  isCurrentTurn
                    ? `${colorStyles.ring} ring-3 scale-110 sm:scale-120 z-30`
                    : ''
                } ${isActivelyMoving ? 'scale-125 -translate-y-1.5' : ''}`}
              >
                {player.name.slice(0, 2).toUpperCase()}

                {isCurrentTurn && (
                  <span className="absolute -inset-1 rounded-full border border-amber-300 animate-ping opacity-75" />
                )}

                {player.isSpeaking && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-white animate-pulse" />
                )}
              </div>

              {/* Player Mini Name */}
              <div className="mt-0.5 px-1 py-0.1 rounded bg-slate-900/90 text-white dark:bg-black/85 dark:text-slate-200 backdrop-blur-xs text-[7px] sm:text-[9px] font-semibold whitespace-nowrap shadow-xs">
                {player.name.slice(0, 8)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
