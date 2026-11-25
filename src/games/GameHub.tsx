import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Gamepad2,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Info,
  ChevronDown,
} from 'lucide-react';
import {
  ActiveGameType,
  GamePlayer,
  GameResultsRank,
  LudoColor,
  LudoPlayerState,
  PlayerTokenColor,
  SnakePlayerState,
} from './types';
import { SnakeGameBoard } from './snake-and-ladder/SnakeGameBoard';
import {
  DEFAULT_SNAKE_BOARD,
  evaluateSnakeTurn,
} from './snake-and-ladder/boardRules';
import { LudoBoard } from './ludo/LudoBoard';
import {
  createInitialLudoTokens,
  evaluateLudoMove,
  canTokenMove,
} from './ludo/ludoRules';
import { AnimatedDice } from './common/AnimatedDice';
import { GameResultsModal } from './common/GameResultsModal';
import { soundEngine } from './engine/soundEngine';
import { RoomMember, UserProfile } from '../types/jam';

interface GameHubProps {
  members: RoomMember[];
  currentUser: UserProfile | null;
  isHost: boolean;
  onSendGameAction: (actionType: string, payload: any) => void;
  // External real-time action listener hook
  lastIncomingAction?: {
    actionType: string;
    payload: any;
    timestamp: number;
  } | null;
}

const TOKEN_COLORS: PlayerTokenColor[] = ['emerald', 'amber', 'crimson', 'azure'];
const LUDO_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

export const GameHub: React.FC<GameHubProps> = ({
  members,
  currentUser,
  isHost,
  onSendGameAction,
  lastIncomingAction,
}) => {
  const [activeGame, setActiveGame] = useState<ActiveGameType>('snake-and-ladder');
  const [soundMuted, setSoundMuted] = useState(false);

  // Turn and dice state
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [turnStartedAt, setTurnStartedAt] = useState(Date.now());
  const [hasRolledThisTurn, setHasRolledThisTurn] = useState(false);

  // Animation indicators
  const [activeMovingPlayerId, setActiveMovingPlayerId] = useState<string | null>(null);
  const [activeTransitionId, setActiveTransitionId] = useState<string | null>(null);
  const [notificationBanner, setNotificationBanner] = useState<string | null>(
    'Welcome to JamTogether Arcade! Roll the dice to begin!'
  );

  // Game 1: Snake & Ladder states
  const [snakeStates, setSnakeStates] = useState<Record<string, SnakePlayerState>>({});

  // Game 2: Ludo states
  const [ludoStates, setLudoStates] = useState<Record<string, LudoPlayerState>>({});

  // Winner & Results state
  const [winnerPlayerId, setWinnerPlayerId] = useState<string | null>(null);
  const [isResultsOpen, setIsResultsOpen] = useState(false);

  // Current user ID helper
  const currentUserId = currentUser?.userId || '';

  // Map room members to game players
  const gamePlayers: GamePlayer[] = useMemo(() => {
    const list = members.slice(0, 4);
    if (list.length === 0 && currentUser) {
      return [
        {
          id: currentUserId,
          name: currentUser.username,
          avatarUrl: currentUser.avatarUrl || '',
          tokenColor: 'emerald',
          ludoColor: 'red',
          seatIndex: 0,
          isHost: true,
          isConnected: true,
        },
      ];
    }
    return list.map((m, idx) => ({
      id: m.userId,
      name: m.username,
      avatarUrl: m.avatarUrl || '',
      tokenColor: TOKEN_COLORS[idx % TOKEN_COLORS.length],
      ludoColor: LUDO_COLORS[idx % LUDO_COLORS.length],
      seatIndex: idx,
      isHost: m.role === 'host',
      isConnected: true,
    }));
  }, [members, currentUser, currentUserId]);

  const currentTurnPlayer = gamePlayers[currentTurnIndex] || gamePlayers[0];
  const isMyTurn = currentTurnPlayer?.id === currentUserId;

  // Initialize or update player states
  useEffect(() => {
    // Snake player state init
    setSnakeStates((prev) => {
      const next = { ...prev };
      gamePlayers.forEach((p) => {
        if (!next[p.id]) {
          next[p.id] = {
            playerId: p.id,
            position: 1,
            hasUnlockedStart: true,
            snakesBitten: 0,
            laddersClimbed: 0,
            sixesRolled: 0,
            finishRank: null,
          };
        }
      });
      return next;
    });

    // Ludo player state init
    setLudoStates((prev) => {
      const next = { ...prev };
      gamePlayers.forEach((p) => {
        if (!next[p.id]) {
          next[p.id] = {
            playerId: p.id,
            color: p.ludoColor,
            tokens: createInitialLudoTokens(p.ludoColor),
            finishedTokens: 0,
            sixesRolled: 0,
            finishRank: null,
          };
        }
      });
      return next;
    });
  }, [gamePlayers]);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundEngine.setEnabled(!next);
  };

  // Switch game mode
  const handleSwitchGame = (game: ActiveGameType) => {
    setActiveGame(game);
    setDiceValue(null);
    setHasRolledThisTurn(false);
    setWinnerPlayerId(null);
    setIsResultsOpen(false);
    setNotificationBanner(`Switched to ${game === 'snake-and-ladder' ? 'Snake & Ladder' : 'Ludo Classic'}!`);
    onSendGameAction('switch_game', { game });
  };

  // Reset match
  const handleResetMatch = () => {
    setDiceValue(null);
    setHasRolledThisTurn(false);
    setWinnerPlayerId(null);
    setIsResultsOpen(false);
    setCurrentTurnIndex(0);
    setTurnStartedAt(Date.now());

    // Reset Snake
    setSnakeStates((prev) => {
      const reset: Record<string, SnakePlayerState> = {};
      Object.keys(prev).forEach((id) => {
        reset[id] = {
          ...prev[id],
          position: 1,
          snakesBitten: 0,
          laddersClimbed: 0,
          sixesRolled: 0,
          finishRank: null,
        };
      });
      return reset;
    });

    // Reset Ludo
    setLudoStates((prev) => {
      const reset: Record<string, LudoPlayerState> = {};
      Object.keys(prev).forEach((id) => {
        const color = prev[id].color;
        reset[id] = {
          ...prev[id],
          tokens: createInitialLudoTokens(color),
          finishedTokens: 0,
          sixesRolled: 0,
          finishRank: null,
        };
      });
      return reset;
    });

    setNotificationBanner('Match restarted! Roll the dice to begin!');
    onSendGameAction('reset_game', {});
  };

  // Advance turn to next player
  const advanceTurn = useCallback(
    (extraTurn: boolean = false) => {
      setHasRolledThisTurn(false);
      setDiceValue(null);
      setTurnStartedAt(Date.now());

      if (extraTurn) {
        setNotificationBanner(`${currentTurnPlayer?.name || 'Player'} rolled a 6 — BONUS TURN! 🎲`);
        return;
      }

      setCurrentTurnIndex((prev) => (prev + 1) % Math.max(1, gamePlayers.length));
    },
    [currentTurnPlayer, gamePlayers.length]
  );

  // Handle Dice Roll
  const handleRollDice = async () => {
    if (!isMyTurn || isRolling || hasRolledThisTurn || !currentUser) return;

    setIsRolling(true);
    soundEngine.playDiceRoll();

    // Roll random 1..6
    const roll = Math.floor(Math.random() * 6) + 1;

    setTimeout(() => {
      setIsRolling(false);
      setDiceValue(roll);
      setHasRolledThisTurn(true);
      soundEngine.playDiceLand();

      if (activeGame === 'snake-and-ladder') {
        // Evaluate Snake & Ladder move immediately
        const currentPos = snakeStates[currentUserId]?.position || 1;
        const result = evaluateSnakeTurn(currentPos, roll, currentUser.username);

        setNotificationBanner(result.notificationText);
        setActiveMovingPlayerId(currentUserId);
        if (result.transitionLinkId) {
          setActiveTransitionId(result.transitionLinkId);
        }

        // Play sounds according to outcome
        if (result.actionType === 'SNAKE_BITE') {
          soundEngine.playSnakeHiss();
        } else if (result.actionType === 'LADDER_CLIMB') {
          soundEngine.playLadderClimb();
        } else {
          soundEngine.playTokenStep();
        }

        // Apply state update
        setSnakeStates((prev) => {
          const cur = prev[currentUserId] || {
            playerId: currentUserId,
            position: 1,
            hasUnlockedStart: true,
            snakesBitten: 0,
            laddersClimbed: 0,
            sixesRolled: 0,
            finishRank: null,
          };
          return {
            ...prev,
            [currentUserId]: {
              ...cur,
              position: result.finalPosition,
              snakesBitten:
                result.actionType === 'SNAKE_BITE' ? cur.snakesBitten + 1 : cur.snakesBitten,
              laddersClimbed:
                result.actionType === 'LADDER_CLIMB' ? cur.laddersClimbed + 1 : cur.laddersClimbed,
              sixesRolled: roll === 6 ? cur.sixesRolled + 1 : cur.sixesRolled,
              finishRank: result.isWinner ? 1 : null,
            },
          };
        });

        // Broadcast action to room
        onSendGameAction('snake_turn', {
          playerId: currentUserId,
          playerName: currentUser.username,
          roll,
          result,
        });

        if (result.isWinner) {
          soundEngine.playVictoryFanfare();
          setWinnerPlayerId(currentUserId);
          setIsResultsOpen(true);
        } else {
          setTimeout(() => {
            setActiveMovingPlayerId(null);
            setActiveTransitionId(null);
            advanceTurn(result.extraTurn);
          }, 1200);
        }
      } else if (activeGame === 'ludo') {
        // For Ludo: check if player has any movable tokens
        const pState = ludoStates[currentUserId];
        const movable = pState?.tokens.filter((t) => canTokenMove(t, roll)) || [];

        if (movable.length === 0) {
          setNotificationBanner(
            `${currentUser.username} rolled a ${roll} — no valid moves! Passing turn.`
          );
          onSendGameAction('ludo_turn_skip', {
            playerId: currentUserId,
            roll,
          });
          setTimeout(() => advanceTurn(false), 1200);
        } else if (movable.length === 1) {
          // Auto move the only valid token
          handleSelectLudoToken(movable[0].id, roll);
        } else {
          setNotificationBanner(
            `Rolled a ${roll}! Click a flashing token to move it.`
          );
        }
      }
    }, 700);
  };

  // Handle Ludo Token Click
  const handleSelectLudoToken = (tokenId: number, customRoll?: number) => {
    const roll = customRoll || diceValue;
    if (!isMyTurn || !roll || !currentUser) return;

    const pState = ludoStates[currentUserId];
    if (!pState) return;

    const evalResult = evaluateLudoMove(pState, tokenId, roll, ludoStates);
    if (!evalResult.canMove) return;

    soundEngine.playTokenStep();
    if (evalResult.isCapturing) {
      soundEngine.playCaptureSound();
    }

    // Apply token move
    setLudoStates((prev) => {
      const next = { ...prev };
      const curPlayer = { ...next[currentUserId] };
      const newTokens = curPlayer.tokens.map((t) => {
        if (t.id === tokenId) {
          return {
            ...t,
            stepCount: evalResult.newStepCount,
            isYard: false,
            isHome: evalResult.isHome,
          };
        }
        return t;
      });

      curPlayer.tokens = newTokens;
      curPlayer.finishedTokens = newTokens.filter((t) => t.isHome).length;
      next[currentUserId] = curPlayer;

      // Handle captured opponent token reset to yard
      if (evalResult.isCapturing && evalResult.capturedColor) {
        Object.keys(next).forEach((oppId) => {
          if (next[oppId].color === evalResult.capturedColor) {
            next[oppId] = {
              ...next[oppId],
              tokens: next[oppId].tokens.map((ot) => {
                if (ot.id === evalResult.capturedTokenId) {
                  return {
                    ...ot,
                    stepCount: -1,
                    isYard: true,
                    isHome: false,
                  };
                }
                return ot;
              }),
            };
          }
        });
      }

      return next;
    });

    const notif = evalResult.isCapturing
      ? `💥 ${currentUser.username} captured an opponent's token! Bonus roll awarded!`
      : evalResult.isHome
      ? `🏆 ${currentUser.username} reached Home with Token #${tokenId + 1}!`
      : `${currentUser.username} moved Token #${tokenId + 1}.`;

    setNotificationBanner(notif);

    // Broadcast Ludo action
    onSendGameAction('ludo_move', {
      playerId: currentUserId,
      playerName: currentUser.username,
      tokenId,
      roll,
      evalResult,
    });

    // Check winner
    const curFinished =
      (ludoStates[currentUserId]?.tokens.filter((t) => t.isHome).length || 0) +
      (evalResult.isHome ? 1 : 0);

    if (curFinished >= 4) {
      soundEngine.playVictoryFanfare();
      setWinnerPlayerId(currentUserId);
      setIsResultsOpen(true);
    } else {
      setTimeout(() => advanceTurn(evalResult.extraTurn), 800);
    }
  };

  // Handle incoming real-time game actions from other room members
  useEffect(() => {
    if (!lastIncomingAction) return;
    const { actionType, payload } = lastIncomingAction;

    if (actionType === 'switch_game' && payload.game) {
      setActiveGame(payload.game);
      setNotificationBanner(`Host switched game to ${payload.game}!`);
    } else if (actionType === 'reset_game') {
      handleResetMatch();
    } else if (actionType === 'snake_turn') {
      const { playerId, playerName, roll, result } = payload;
      setDiceValue(roll);
      setNotificationBanner(result.notificationText);
      setActiveMovingPlayerId(playerId);

      if (result.actionType === 'SNAKE_BITE') soundEngine.playSnakeHiss();
      else if (result.actionType === 'LADDER_CLIMB') soundEngine.playLadderClimb();
      else soundEngine.playTokenStep();

      setSnakeStates((prev) => {
        const cur = prev[playerId] || {
          playerId,
          position: 1,
          hasUnlockedStart: true,
          snakesBitten: 0,
          laddersClimbed: 0,
          sixesRolled: 0,
          finishRank: null,
        };
        return {
          ...prev,
          [playerId]: {
            ...cur,
            position: result.finalPosition,
            snakesBitten:
              result.actionType === 'SNAKE_BITE' ? cur.snakesBitten + 1 : cur.snakesBitten,
            laddersClimbed:
              result.actionType === 'LADDER_CLIMB' ? cur.laddersClimbed + 1 : cur.laddersClimbed,
            finishRank: result.isWinner ? 1 : null,
          },
        };
      });

      if (result.isWinner) {
        soundEngine.playVictoryFanfare();
        setWinnerPlayerId(playerId);
        setIsResultsOpen(true);
      } else {
        setTimeout(() => {
          setActiveMovingPlayerId(null);
          advanceTurn(result.extraTurn);
        }, 1200);
      }
    } else if (actionType === 'ludo_move') {
      const { playerId, tokenId, roll, evalResult, playerName } = payload;
      setDiceValue(roll);
      soundEngine.playTokenStep();
      if (evalResult.isCapturing) soundEngine.playCaptureSound();

      setLudoStates((prev) => {
        const next = { ...prev };
        if (!next[playerId]) return next;
        next[playerId] = {
          ...next[playerId],
          tokens: next[playerId].tokens.map((t) =>
            t.id === tokenId
              ? { ...t, stepCount: evalResult.newStepCount, isYard: false, isHome: evalResult.isHome }
              : t
          ),
        };
        return next;
      });

      setTimeout(() => advanceTurn(evalResult.extraTurn), 800);
    }
  }, [lastIncomingAction]);

  // Rankings for results podium
  const rankings: GameResultsRank[] = useMemo(() => {
    if (activeGame === 'snake-and-ladder') {
      return gamePlayers
        .map((p) => {
          const state = snakeStates[p.id];
          return {
            playerId: p.id,
            name: p.name,
            avatarUrl: p.avatarUrl,
            rank: state?.finishRank || 2,
            scoreText: `Square ${state?.position || 1} / 100`,
            details: `🐍 ${state?.snakesBitten || 0}  🪜 ${state?.laddersClimbed || 0}`,
          };
        })
        .sort((a, b) => (a.rank === 1 ? -1 : 1));
    } else {
      return gamePlayers
        .map((p) => {
          const state = ludoStates[p.id];
          const homeCount = state?.tokens.filter((t) => t.isHome).length || 0;
          return {
            playerId: p.id,
            name: p.name,
            avatarUrl: p.avatarUrl,
            rank: homeCount === 4 ? 1 : 2,
            scoreText: `${homeCount} / 4 Tokens Home`,
            details: `Color: ${p.ludoColor.toUpperCase()}`,
          };
        })
        .sort((a, b) => b.scoreText.localeCompare(a.scoreText));
    }
  }, [activeGame, gamePlayers, snakeStates, ludoStates]);

  const winner = gamePlayers.find((p) => p.id === winnerPlayerId) || currentTurnPlayer;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Top Arcade Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 sm:p-2.5 rounded-2xl bg-white/90 dark:bg-[#121624]/90 border border-slate-200/80 dark:border-slate-800/80 shadow-md backdrop-blur-md">
        {/* Game Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#1A1F33]">
          <button
            type="button"
            onClick={() => handleSwitchGame('snake-and-ladder')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeGame === 'snake-and-ladder'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>🐍</span>
            <span>Snake & Ladder</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchGame('ludo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeGame === 'ludo'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>🎲</span>
            <span>Ludo Classic</span>
          </button>
        </div>

        {/* Turn Status Pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 dark:text-slate-400">Turn:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {currentTurnPlayer?.name || 'Player'}
            </span>
            {isMyTurn && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-500 text-slate-950 animate-bounce">
                YOU
              </span>
            )}
          </div>

          {/* Sound FX Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title={soundMuted ? 'Unmute Game Audio' : 'Mute Game Audio'}
          >
            {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Reset / Rematch */}
          {isHost && (
            <button
              type="button"
              onClick={handleResetMatch}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Reset Board"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Real-time Notification Banner */}
      {notificationBanner && (
        <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center justify-between gap-2 animate-fade-in">
          <span className="truncate">{notificationBanner}</span>
          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 shrink-0">
            {activeGame === 'snake-and-ladder' ? 'Square 1..100' : '4 Tokens to Center'}
          </span>
        </div>
      )}

      {/* Main Arena: Game Board & Dice */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Game Board (Col span 8 or 9) */}
        <div className="md:col-span-8 lg:col-span-8 flex items-center justify-center">
          {activeGame === 'snake-and-ladder' ? (
            <SnakeGameBoard
              boardConfig={DEFAULT_SNAKE_BOARD}
              players={gamePlayers}
              playerStates={snakeStates}
              currentTurnPlayerId={currentTurnPlayer?.id || ''}
              activeMovingPlayerId={activeMovingPlayerId}
              activeTransitionId={activeTransitionId}
            />
          ) : (
            <LudoBoard
              players={gamePlayers}
              playerStates={ludoStates}
              currentTurnPlayerId={currentTurnPlayer?.id || ''}
              myPlayerId={currentUserId}
              diceValue={diceValue}
              hasRolled={hasRolledThisTurn}
              onSelectToken={(tid) => handleSelectLudoToken(tid)}
            />
          )}
        </div>

        {/* Dice & Turn Control Panel (Col span 4) */}
        <div className="md:col-span-4 lg:col-span-4 flex flex-col items-center justify-center gap-3">
          <AnimatedDice
            isRolling={isRolling}
            diceValue={diceValue}
            isMyTurn={isMyTurn}
            onRoll={handleRollDice}
            turnTimeoutSeconds={45}
            turnStartedAt={turnStartedAt}
            currentTurnPlayerName={currentTurnPlayer?.name}
          />

          {/* Quick Player Turn Roster */}
          <div className="w-full p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              Players in Match ({gamePlayers.length})
            </span>
            <div className="space-y-1.5">
              {gamePlayers.map((p) => {
                const isCurrent = p.id === currentTurnPlayer?.id;
                const pos =
                  activeGame === 'snake-and-ladder'
                    ? `Sq ${snakeStates[p.id]?.position || 1}`
                    : `${ludoStates[p.id]?.tokens.filter((t) => t.isHome).length || 0}/4 Home`;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-1.5 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="truncate">{p.name}</span>
                      {p.id === currentUserId && (
                        <span className="text-[9px] text-slate-400 font-mono">(You)</span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] shrink-0 font-bold">{pos}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results Modal */}
      <GameResultsModal
        isOpen={isResultsOpen}
        winnerName={winner?.name || 'Player'}
        winnerAvatarUrl={winner?.avatarUrl}
        isMeWinner={winner?.id === currentUserId}
        isHost={isHost}
        gameTitle={activeGame === 'snake-and-ladder' ? 'Serpent & Spire' : 'Ludo Classic'}
        rankings={rankings}
        onRematch={handleResetMatch}
        onClose={() => setIsResultsOpen(false)}
      />
    </div>
  );
};
