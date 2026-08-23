export type Vibe =
  | "locura"
  | "intimidad"
  | "competicion"
  | "risas"
  | "incomodidad"
  | "nostalgia";

export type ChallengeType =
  | "drink"
  | "truth"
  | "physical"
  | "vote"
  | "karaoke"
  | "phone"
  | "couple"
  | "strip"
  | "minigame";

export type GameMode = "cooperativo" | "todos_contra_todos" | "todos_contra_uno";

export type OrientationPref =
  | "hetero"
  | "gay"
  | "lesbiana"
  | "bi"
  | "pan"
  | "neutro";

export type ContentLevel = "suave" | "medio" | "picante" | "sin_limite";

export interface Challenge {
  id: string;
  type: ChallengeType;
  intensity: number;
  vibes: Vibe[];
  text: string;
  baseDrinks: number;
  orientations: OrientationPref[];
  contentLevel: ContentLevel;
  custom?: boolean;
}

export interface GameSettings {
  vibes: Vibe[];
  challengeTypes: ChallengeType[];
  orientations: OrientationPref[];
  contentLevel: ContentLevel;
  stripEnabled: boolean;
}

export interface Player {
  id: string;
  name: string;
  drunkLevel: number;
  drinksAlcohol: boolean;
  isHost: boolean;
  connected: boolean;
  stats: PlayerStats;
  isFino: boolean;
}

export interface PlayerStats {
  timesSelected: number;
  drinksTaken: number;
  challengesCompleted: number;
  challengesSkipped: number;
  penaltiesTaken: number;
}

export interface RoomState {
  code: string;
  phase: "setup" | "lobby" | "drunk_check" | "spinning" | "challenge" | "ended";
  settings: GameSettings | null;
  players: Player[];
  hostId: string;
  round: number;
  lastSelectedId: string | null;
  currentMode: GameMode | null;
  currentChallenge: Challenge | null;
  currentTargets: string[];
  spinPlayerIds: string[];
  drunkCheckRound: number;
  sessionAlerts: SessionAlert[];
  customChallenges: Challenge[];
  activeSpin: SpinResult | null;
  resolvedTargets: string[];
}

export interface SessionAlert {
  id: string;
  type: "fino" | "warning" | "info";
  message: string;
  playerId?: string;
  timestamp: number;
}

export interface SpinResult {
  targets: string[];
  mode: GameMode;
  challenge: Challenge;
  drinkAmounts: Record<string, number>;
  soberAlternatives: Record<string, string>;
  displayTexts: Record<string, string>;
}

export const VIBE_LABELS: Record<Vibe, string> = {
  locura: "Locura",
  intimidad: "Intimidad",
  competicion: "Competición",
  risas: "Risas",
  incomodidad: "Incomodidad divertida",
  nostalgia: "Nostalgia",
};

export const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  drink: "Beber",
  truth: "Verdad / confesión",
  physical: "Reto físico",
  vote: "Votación",
  karaoke: "Karaoke",
  phone: "Reto teléfono (texto)",
  couple: "Pareja / contacto físico",
  strip: "Strip",
  minigame: "Mini-juego",
};

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  cooperativo: "Cooperativo — todos juntos",
  todos_contra_todos: "Todos contra todos",
  todos_contra_uno: "Todos contra uno",
};

export const ORIENTATION_LABELS: Record<OrientationPref, string> = {
  hetero: "Hetero",
  gay: "Gay",
  lesbiana: "Lesbiana",
  bi: "Bi",
  pan: "Pan / todos",
  neutro: "Neutro (sin romance)",
};

export const CONTENT_LEVEL_LABELS: Record<ContentLevel, string> = {
  suave: "Suave",
  medio: "Medio",
  picante: "Picante",
  sin_limite: "Sin límite",
};

export const ALL_VIBES: Vibe[] = [
  "locura",
  "intimidad",
  "competicion",
  "risas",
  "incomodidad",
  "nostalgia",
];

export const ALL_CHALLENGE_TYPES: ChallengeType[] = [
  "drink",
  "truth",
  "physical",
  "vote",
  "karaoke",
  "phone",
  "couple",
  "strip",
  "minigame",
];

export const ALL_ORIENTATIONS: OrientationPref[] = [
  "hetero",
  "gay",
  "lesbiana",
  "bi",
  "pan",
  "neutro",
];

export const ALL_CONTENT_LEVELS: ContentLevel[] = [
  "suave",
  "medio",
  "picante",
  "sin_limite",
];
