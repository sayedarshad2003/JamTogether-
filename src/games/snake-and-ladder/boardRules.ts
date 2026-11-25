import { LadderLink, SnakeBoardConfig, SnakeLink } from '../types';

export const STANDARD_SNAKES: SnakeLink[] = [
  {
    id: 'snake-98-28',
    head: 98,
    tail: 28,
    name: 'Emperor Viper',
    primaryColor: '#F43F5E',
    secondaryColor: '#9F1239',
    bellyColor: '#FDA4AF',
  },
  {
    id: 'snake-95-56',
    head: 95,
    tail: 56,
    name: 'Amethyst Cobra',
    primaryColor: '#A855F7',
    secondaryColor: '#6B21A8',
    bellyColor: '#E9D5FF',
  },
  {
    id: 'snake-92-51',
    head: 92,
    tail: 51,
    name: 'Sunfire Mamba',
    primaryColor: '#F97316',
    secondaryColor: '#9A3412',
    bellyColor: '#FED7AA',
  },
  {
    id: 'snake-83-19',
    head: 83,
    tail: 19,
    name: 'Jade Boa',
    primaryColor: '#10B981',
    secondaryColor: '#065F46',
    bellyColor: '#A7F3D0',
  },
  {
    id: 'snake-73-53',
    head: 73,
    tail: 53,
    name: 'Coral Adder',
    primaryColor: '#EC4899',
    secondaryColor: '#831843',
    bellyColor: '#FBCFE8',
  },
  {
    id: 'snake-64-36',
    head: 64,
    tail: 36,
    name: 'Frost Python',
    primaryColor: '#06B6D4',
    secondaryColor: '#155E75',
    bellyColor: '#A5F3FC',
  },
  {
    id: 'snake-48-11',
    head: 48,
    tail: 11,
    name: 'Gilded Sidewinder',
    primaryColor: '#EAB308',
    secondaryColor: '#713F12',
    bellyColor: '#FEF08A',
  },
  {
    id: 'snake-26-7',
    head: 26,
    tail: 7,
    name: 'Shadow Asp',
    primaryColor: '#EF4444',
    secondaryColor: '#7F1D1D',
    bellyColor: '#FECACA',
  },
];

export const STANDARD_LADDERS: LadderLink[] = [
  {
    id: 'ladder-4-25',
    bottom: 4,
    top: 25,
    name: 'Dawn Step',
    woodColor: '#D97706',
    railColor: '#FDE68A',
  },
  {
    id: 'ladder-13-46',
    bottom: 13,
    top: 46,
    name: 'Canopy Ascent',
    woodColor: '#B45309',
    railColor: '#FCD34D',
  },
  {
    id: 'ladder-21-42',
    bottom: 21,
    top: 42,
    name: 'Sunlit Bridge',
    woodColor: '#D97706',
    railColor: '#FDE68A',
  },
  {
    id: 'ladder-33-49',
    bottom: 33,
    top: 49,
    name: 'Pilgrim Stair',
    woodColor: '#B45309',
    railColor: '#FCD34D',
  },
  {
    id: 'ladder-43-77',
    bottom: 43,
    top: 77,
    name: 'Grand Citadel Rise',
    woodColor: '#D97706',
    railColor: '#FDE68A',
  },
  {
    id: 'ladder-50-69',
    bottom: 50,
    top: 69,
    name: 'Windward Ladder',
    woodColor: '#B45309',
    railColor: '#FCD34D',
  },
  {
    id: 'ladder-62-81',
    bottom: 62,
    top: 81,
    name: 'Skyward Spire',
    woodColor: '#D97706',
    railColor: '#FDE68A',
  },
  {
    id: 'ladder-74-93',
    bottom: 74,
    top: 93,
    name: 'Celestial Gate',
    woodColor: '#F59E0B',
    railColor: '#FEF3C7',
  },
];

export const DEFAULT_SNAKE_BOARD: SnakeBoardConfig = {
  snakes: STANDARD_SNAKES,
  ladders: STANDARD_LADDERS,
};

export interface BoardCellCoord {
  square: number;
  visualRow: number; // 0 (top) to 9 (bottom)
  visualCol: number; // 0 (left) to 9 (right)
  boardRowFromBottom: number; // 0 (bottom) to 9 (top)
  centerXPercent: number; // 5 to 95
  centerYPercent: number; // 5 to 95
}

export function getSquareCoordinates(square: number): BoardCellCoord {
  const clamped = Math.max(1, Math.min(100, square));
  const zeroBased = clamped - 1;
  const boardRowFromBottom = Math.floor(zeroBased / 10);
  const offsetInRow = zeroBased % 10;
  const isLeftToRight = boardRowFromBottom % 2 === 0;
  const visualCol = isLeftToRight ? offsetInRow : 9 - offsetInRow;
  const visualRow = 9 - boardRowFromBottom;

  return {
    square: clamped,
    visualRow,
    visualCol,
    boardRowFromBottom,
    centerXPercent: visualCol * 10 + 5,
    centerYPercent: visualRow * 10 + 5,
  };
}

export function generateZigzagBoardGrid(): BoardCellCoord[] {
  const cells: BoardCellCoord[] = [];
  for (let visualRow = 0; visualRow < 10; visualRow++) {
    const boardRowFromBottom = 9 - visualRow;
    const isLeftToRight = boardRowFromBottom % 2 === 0;
    for (let visualCol = 0; visualCol < 10; visualCol++) {
      const offsetInRow = isLeftToRight ? visualCol : 9 - visualCol;
      const square = boardRowFromBottom * 10 + offsetInRow + 1;
      cells.push(getSquareCoordinates(square));
    }
  }
  return cells;
}

export interface SnakeTurnResult {
  actionType: 'MOVE' | 'SNAKE_BITE' | 'LADDER_CLIMB' | 'BOUNCE' | 'WIN';
  previousPosition: number;
  intermediatePosition: number;
  finalPosition: number;
  stepPath: number[];
  extraTurn: boolean;
  isWinner: boolean;
  transitionLinkId: string | null;
  notificationText: string;
}

export function evaluateSnakeTurn(
  currentPos: number,
  diceValue: number,
  playerName: string,
  board: SnakeBoardConfig = DEFAULT_SNAKE_BOARD
): SnakeTurnResult {
  const rawTarget = currentPos + diceValue;
  const extraTurn = diceValue === 6;

  // Overshoot check (Exact 100 to win)
  if (rawTarget > 100) {
    return {
      actionType: 'BOUNCE',
      previousPosition: currentPos,
      intermediatePosition: currentPos,
      finalPosition: currentPos,
      stepPath: [currentPos],
      extraTurn,
      isWinner: false,
      transitionLinkId: null,
      notificationText: `${playerName} rolled a ${diceValue} — needs an exact ${100 - currentPos} to reach square 100!`,
    };
  }

  // Build step-by-step path
  const stepPath: number[] = [];
  for (let sq = currentPos + 1; sq <= rawTarget; sq++) {
    stepPath.push(sq);
  }

  // Reached square 100 exactly
  if (rawTarget === 100) {
    return {
      actionType: 'WIN',
      previousPosition: currentPos,
      intermediatePosition: 100,
      finalPosition: 100,
      stepPath,
      extraTurn: false,
      isWinner: true,
      transitionLinkId: null,
      notificationText: `🎉 ${playerName} reached square 100 and WON the match!`,
    };
  }

  // Check Ladder
  const ladder = board.ladders.find((l) => l.bottom === rawTarget);
  if (ladder) {
    return {
      actionType: 'LADDER_CLIMB',
      previousPosition: currentPos,
      intermediatePosition: rawTarget,
      finalPosition: ladder.top,
      stepPath,
      extraTurn,
      isWinner: ladder.top === 100,
      transitionLinkId: ladder.id,
      notificationText: `🪜 ${playerName} climbed ${ladder.name} from ${rawTarget} to ${ladder.top}!`,
    };
  }

  // Check Snake
  const snake = board.snakes.find((s) => s.head === rawTarget);
  if (snake) {
    return {
      actionType: 'SNAKE_BITE',
      previousPosition: currentPos,
      intermediatePosition: rawTarget,
      finalPosition: snake.tail,
      stepPath,
      extraTurn,
      isWinner: false,
      transitionLinkId: snake.id,
      notificationText: `🐍 ${playerName} bitten by ${snake.name}! Slid down from ${rawTarget} to ${snake.tail}!`,
    };
  }

  // Normal advance
  return {
    actionType: 'MOVE',
    previousPosition: currentPos,
    intermediatePosition: rawTarget,
    finalPosition: rawTarget,
    stepPath,
    extraTurn,
    isWinner: false,
    transitionLinkId: null,
    notificationText: `${playerName} rolled a ${diceValue} and moved to square ${rawTarget}.`,
  };
}
