export type Phase = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'ended';

export interface RoomSettings {
  rounds: number;
  drawTime: number;
  hints: number;
  hintInterval: number;
  wordCount: number;      // how many word choices the drawer sees
  maxPlayers: number;     // max players allowed in room
  categories: string[];
  customWords: string;
  password?: string;
}

export interface CurrentRound {
  drawerId: string;
  wordMask: string;
  wordLength: number;
  startedAt: number;
  timeLimit: number;
  roundNumber: number;
  guessCount: number; // how many have guessed so far this round
}

export interface Room {
  id: string;
  hostId: string;
  phase: Phase;
  settings: RoomSettings;
  currentRound?: CurrentRound;
  wordChoices?: string[];
  reveal?: { word: string };
  votes?: {
    skip?: Record<string, boolean>;
  };
  reactions?: Record<string, { emoji: string; timestamp: number }>;
  turnOrder?: string[]; // fixed player ID order set at game start
  createdAt: number;
  lastActive: number;
}

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  score: number;
  streak: number;
  connected: boolean;
  isHost: boolean;
  hasGuessed: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  isSystem: boolean;
  isCorrect: boolean;
  isGuessOnly: boolean; // true = only visible to players who have guessed
  guessOrder?: number;  // 1st, 2nd, 3rd guesser
  pointsEarned?: number; // points awarded for this guess
  roundTimestamp?: number; // seconds elapsed when guessed (for display)
  timestamp: number;
}

export interface Stroke {
  tool: string;
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

export interface CanvasState {
  completedStrokes: string;
  activeStroke: string | null;
  clearedAt: number;
  lastUpdate: number;
}
