import { LudoColor, LudoPlayerState, LudoToken } from '../types';

export interface LudoCoord {
  col: number; // 0 to 14
  row: number; // 0 to 14
}

// 52-step perimeter track coordinates on a 15x15 board
export const LUDO_TRACK_COORDS: LudoCoord[] = [
  // Red side start & top-left arm going up (steps 0..4)
  { col: 1, row: 6 },
  { col: 2, row: 6 },
  { col: 3, row: 6 },
  { col: 4, row: 6 },
  { col: 5, row: 6 },

  // Turning up along Green's left (steps 5..10)
  { col: 6, row: 5 },
  { col: 6, row: 4 },
  { col: 6, row: 3 },
  { col: 6, row: 2 },
  { col: 6, row: 1 },
  { col: 6, row: 0 },

  // Top transition (steps 11..12)
  { col: 7, row: 0 },
  { col: 8, row: 0 },

  // Going down Green's start & right (steps 13..17)
  { col: 8, row: 1 }, // Green start (13)
  { col: 8, row: 2 },
  { col: 8, row: 3 },
  { col: 8, row: 4 },
  { col: 8, row: 5 },

  // Turning right along Yellow's top (steps 18..23)
  { col: 9, row: 6 },
  { col: 10, row: 6 },
  { col: 11, row: 6 },
  { col: 12, row: 6 },
  { col: 13, row: 6 },
  { col: 14, row: 6 },

  // Right transition (steps 24..25)
  { col: 14, row: 7 },
  { col: 14, row: 8 },

  // Going left Yellow's start & bottom (steps 26..30)
  { col: 13, row: 8 }, // Yellow start (26)
  { col: 12, row: 8 },
  { col: 11, row: 8 },
  { col: 10, row: 8 },
  { col: 9, row: 8 },

  // Turning down along Blue's right (steps 31..36)
  { col: 8, row: 9 },
  { col: 8, row: 10 },
  { col: 8, row: 11 },
  { col: 8, row: 12 },
  { col: 8, row: 13 },
  { col: 8, row: 14 },

  // Bottom transition (steps 37..38)
  { col: 7, row: 14 },
  { col: 6, row: 14 },

  // Going up Blue's start & left (steps 39..43)
  { col: 6, row: 13 }, // Blue start (39)
  { col: 6, row: 12 },
  { col: 6, row: 11 },
  { col: 6, row: 10 },
  { col: 6, row: 9 },

  // Turning left along Red's bottom (steps 44..49)
  { col: 5, row: 8 },
  { col: 4, row: 8 },
  { col: 3, row: 8 },
  { col: 2, row: 8 },
  { col: 1, row: 8 },
  { col: 0, row: 8 },

  // Left transition (steps 50..51)
  { col: 0, row: 7 },
  { col: 0, row: 6 },
];

export const COLOR_START_INDEX: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// Safe track indexes where pieces cannot be knocked out
export const SAFE_TRACK_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Home columns for each color (5 steps leading into center)
export const LUDO_HOME_COLUMNS: Record<LudoColor, LudoCoord[]> = {
  red: [
    { col: 1, row: 7 },
    { col: 2, row: 7 },
    { col: 3, row: 7 },
    { col: 4, row: 7 },
    { col: 5, row: 7 },
  ],
  green: [
    { col: 7, row: 1 },
    { col: 7, row: 2 },
    { col: 7, row: 3 },
    { col: 7, row: 4 },
    { col: 7, row: 5 },
  ],
  yellow: [
    { col: 13, row: 7 },
    { col: 12, row: 7 },
    { col: 11, row: 7 },
    { col: 10, row: 7 },
    { col: 9, row: 7 },
  ],
  blue: [
    { col: 7, row: 13 },
    { col: 7, row: 12 },
    { col: 7, row: 11 },
    { col: 7, row: 10 },
    { col: 7, row: 9 },
  ],
};

// Yard token slot positions (4 circles in each 6x6 corner)
export const LUDO_YARD_SLOTS: Record<LudoColor, LudoCoord[]> = {
  red: [
    { col: 1.8, row: 1.8 },
    { col: 3.8, row: 1.8 },
    { col: 1.8, row: 3.8 },
    { col: 3.8, row: 3.8 },
  ],
  green: [
    { col: 10.8, row: 1.8 },
    { col: 12.8, row: 1.8 },
    { col: 10.8, row: 3.8 },
    { col: 12.8, row: 3.8 },
  ],
  yellow: [
    { col: 10.8, row: 10.8 },
    { col: 12.8, row: 10.8 },
    { col: 10.8, row: 12.8 },
    { col: 12.8, row: 12.8 },
  ],
  blue: [
    { col: 1.8, row: 10.8 },
    { col: 3.8, row: 10.8 },
    { col: 1.8, row: 12.8 },
    { col: 3.8, row: 12.8 },
  ],
};

export function createInitialLudoTokens(color: LudoColor): LudoToken[] {
  return [0, 1, 2, 3].map((id) => ({
    id,
    color,
    stepCount: -1, // -1 means in yard
    isYard: true,
    isHome: false,
  }));
}

export function getTokenCoord(token: LudoToken): { xPercent: number; yPercent: number } {
  if (token.isHome) {
    // Center victory square (7, 7)
    return {
      xPercent: (7 + 0.5) * (100 / 15),
      yPercent: (7 + 0.5) * (100 / 15),
    };
  }

  if (token.isYard || token.stepCount < 0) {
    const slot = LUDO_YARD_SLOTS[token.color][token.id];
    return {
      xPercent: (slot.col + 0.2) * (100 / 15),
      yPercent: (slot.row + 0.2) * (100 / 15),
    };
  }

  // Active on track or home column
  if (token.stepCount < 51) {
    const trackIndex = (COLOR_START_INDEX[token.color] + token.stepCount) % 52;
    const coord = LUDO_TRACK_COORDS[trackIndex];
    return {
      xPercent: (coord.col + 0.5) * (100 / 15),
      yPercent: (coord.row + 0.5) * (100 / 15),
    };
  }

  // Inside Home Column (step 51..55)
  const homeColIndex = Math.min(4, token.stepCount - 51);
  const homeCoord = LUDO_HOME_COLUMNS[token.color][homeColIndex];
  return {
    xPercent: (homeCoord.col + 0.5) * (100 / 15),
    yPercent: (homeCoord.row + 0.5) * (100 / 15),
  };
}

export interface LudoMoveEvaluation {
  canMove: boolean;
  newStepCount: number;
  isCapturing: boolean;
  capturedColor?: LudoColor;
  capturedTokenId?: number;
  isHome: boolean;
  extraTurn: boolean;
}

export function canTokenMove(token: LudoToken, dice: number): boolean {
  if (token.isHome) return false;
  if (token.isYard) return dice === 6;
  return token.stepCount + dice <= 56;
}

export function evaluateLudoMove(
  movingPlayer: LudoPlayerState,
  tokenId: number,
  dice: number,
  allPlayers: Record<string, LudoPlayerState>
): LudoMoveEvaluation {
  const token = movingPlayer.tokens[tokenId];
  if (!token || !canTokenMove(token, dice)) {
    return { canMove: false, newStepCount: token ? token.stepCount : -1, isCapturing: false, isHome: false, extraTurn: false };
  }

  let nextStep: number;
  if (token.isYard) {
    nextStep = 0; // Released from yard to start square
  } else {
    nextStep = token.stepCount + dice;
  }

  const reachesHome = nextStep === 56;
  let isCapturing = false;
  let capturedColor: LudoColor | undefined;
  let capturedTokenId: number | undefined;

  // Check capture if landing on common track (0..50)
  if (nextStep <= 50) {
    const targetGlobalTrack = (COLOR_START_INDEX[token.color] + nextStep) % 52;
    const isSafe = SAFE_TRACK_INDEXES.has(targetGlobalTrack);

    if (!isSafe) {
      for (const p of Object.values(allPlayers)) {
        if (p.color === movingPlayer.color) continue;
        for (const opponentToken of p.tokens) {
          if (!opponentToken.isYard && !opponentToken.isHome && opponentToken.stepCount <= 50) {
            const oppGlobalTrack = (COLOR_START_INDEX[opponentToken.color] + opponentToken.stepCount) % 52;
            if (oppGlobalTrack === targetGlobalTrack) {
              isCapturing = true;
              capturedColor = opponentToken.color;
              capturedTokenId = opponentToken.id;
              break;
            }
          }
        }
        if (isCapturing) break;
      }
    }
  }

  const extraTurn = dice === 6 || isCapturing || reachesHome;

  return {
    canMove: true,
    newStepCount: reachesHome ? 57 : nextStep,
    isCapturing,
    capturedColor,
    capturedTokenId,
    isHome: reachesHome,
    extraTurn,
  };
}
