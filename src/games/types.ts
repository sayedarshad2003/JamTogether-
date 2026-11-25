export type ActiveGameType = 'snake-and-ladder' | 'ludo';

export type PlayerTokenColor = 'emerald' | 'amber' | 'crimson' | 'azure';
export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface GamePlayer {
  id: string;
  name: string;
  avatarUrl: string;
  tokenColor: PlayerTokenColor;
  ludoColor: LudoColor;
  seatIndex: number;
  isHost: boolean;
  isConnected: boolean;
  isSpeaking?: boolean;
}

// -------------------------------------------------------------
// Snake & Ladder Types
// -------------------------------------------------------------
export interface SnakeLink {
  id: string;
  head: number;
  tail: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  bellyColor: string;
}

export interface LadderLink {
  id: string;
  bottom: number;
  top: number;
  name: string;
  woodColor: string;
  railColor: string;
}

export interface SnakeBoardConfig {
  snakes: SnakeLink[];
  ladders: LadderLink[];
}

export interface SnakePlayerState {
  playerId: string;
  position: number; // 1 to 100
  hasUnlockedStart: boolean;
  snakesBitten: number;
  laddersClimbed: number;
  sixesRolled: number;
  finishRank: number | null;
}

// -------------------------------------------------------------
// Ludo Types
// -------------------------------------------------------------
export interface LudoToken {
  id: number; // 0, 1, 2, 3
  color: LudoColor;
  stepCount: number; // -1 = Yard, 0 = Start, 1..50 = Track, 51..56 = Home Column, 57 = Finished Home
  isYard: boolean;
  isHome: boolean;
}

export interface LudoPlayerState {
  playerId: string;
  color: LudoColor;
  tokens: LudoToken[];
  finishedTokens: number;
  sixesRolled: number;
  finishRank: number | null;
}

// -------------------------------------------------------------
// Shared Arcade State
// -------------------------------------------------------------
export interface GameTurnAction {
  actionId: string;
  gameType: ActiveGameType;
  playerId: string;
  playerName: string;
  actionType: string;
  diceValue: number;
  extraTurn: boolean;
  notificationText: string;
  timestamp: number;
}

export interface GameResultsRank {
  playerId: string;
  name: string;
  avatarUrl: string;
  rank: number;
  scoreText: string;
  details: string;
}
