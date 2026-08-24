import type {
  Challenge,
  ContentLevel,
  GameSettings,
  OrientationPref,
} from "./types";
import {
  challengeFitsRoomGenders,
  type GenderedPlayer,
} from "./genderMatch";

const LEVEL_ORDER: ContentLevel[] = ["suave", "medio", "picante", "sin_limite"];

/**
 * El nivel de la sala es un TECHO, no un match exacto:
 * un reto `picante` sí sale en `sin_limite`; un reto `sin_limite` no sale en `picante`.
 * `selectChallenge` prioriza el nivel elegido (y el de al lado) antes de bajar más.
 */
export function contentLevelAllowed(
  challengeLevel: ContentLevel,
  maxLevel: ContentLevel
): boolean {
  return LEVEL_ORDER.indexOf(challengeLevel) <= LEVEL_ORDER.indexOf(maxLevel);
}

export function contentLevelDistance(
  challengeLevel: ContentLevel,
  selected: ContentLevel
): number {
  return Math.abs(
    LEVEL_ORDER.indexOf(challengeLevel) - LEVEL_ORDER.indexOf(selected)
  );
}

/** Neutro vale para todos. El resto solo si el host marcó esa orientación. */
export function matchesOrientation(
  challengeOrients: OrientationPref[] | undefined,
  selected: OrientationPref[] | undefined
): boolean {
  if (!challengeOrients || challengeOrients.length === 0) return true;
  if (challengeOrients.includes("neutro")) return true;
  if (!selected || selected.length === 0) return false;
  return challengeOrients.some((o) => selected.includes(o));
}

/** Restricciones que NUNCA se relajan: tipo, techo de contenido, strip, pareja, orientación. */
export function matchesHardConstraints(
  challenge: Challenge,
  settings: GameSettings
): boolean {
  if (!settings.challengeTypes.includes(challenge.type)) return false;
  if (!contentLevelAllowed(challenge.contentLevel, settings.contentLevel)) {
    return false;
  }
  if (challenge.type === "strip" && !settings.stripEnabled) return false;
  if (challenge.type === "couple" && !settings.coupleChallengesEnabled) {
    return false;
  }
  if (!matchesOrientation(challenge.orientations, settings.orientations)) {
    return false;
  }
  if (
    !settings.coupleChallengesEnabled &&
    challenge.orientations.length > 0 &&
    !challenge.orientations.includes("neutro")
  ) {
    return false;
  }
  return true;
}

export function filterHardConstraints(
  all: Challenge[],
  settings: GameSettings,
  players: GenderedPlayer[] = []
): Challenge[] {
  return all.filter(
    (c) =>
      matchesHardConstraints(c, settings) &&
      challengeFitsRoomGenders(c, players, settings)
  );
}

function matchesVibes(challenge: Challenge, settings: GameSettings): boolean {
  if (settings.vibes.length === 0 || challenge.vibes.length === 0) return true;
  return challenge.vibes.some((v) => settings.vibes.includes(v));
}

function weightedPick(
  pool: Challenge[],
  settings: GameSettings,
  rng: () => number
): Challenge {
  const weights = pool.map((c) => {
    const d = contentLevelDistance(c.contentLevel, settings.contentLevel);
    if (d === 0) return 8;
    if (d === 1) return 3;
    if (d === 2) return 0.6;
    return 0.2;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export const NO_MATCHING_CHALLENGE =
  "No hay ningún reto que encaje con tipo, contenido, orientación, géneros de la sala, strip y pareja. Cambia los tags o espera a más gente.";

export type ChallengePick =
  | {
      ok: true;
      challenge: Challenge;
      relaxed: "none" | "content" | "intensity" | "vibes";
    }
  | { ok: false; reason: string };

/**
 * Elige un reto sin violar nunca las restricciones duras.
 * Si el pool ideal está vacío, relaja: cercanía de contenido → intensity → vibes.
 * Nunca “cualquier reto”.
 */
const MIN_TIER_CHOICES = 6;

function poolWithoutRecent(
  hard: Challenge[],
  excludeIds: string[]
): Challenge[] {
  if (hard.length === 0 || excludeIds.length === 0) return hard;
  const unused = hard.filter((c) => !excludeIds.includes(c.id));
  if (unused.length >= Math.min(MIN_TIER_CHOICES, hard.length)) return unused;
  const lastFew = new Set(excludeIds.slice(-3));
  const notLast = hard.filter((c) => !lastFew.has(c.id));
  return notLast.length > 0 ? notLast : hard;
}

export function selectChallenge(
  all: Challenge[],
  settings: GameSettings,
  round: number,
  players: GenderedPlayer[] = [],
  rng: () => number = Math.random,
  excludeIds: string[] = []
): ChallengePick {
  const constrained = filterHardConstraints(all, settings, players);
  const hard = poolWithoutRecent(constrained, excludeIds);
  if (hard.length === 0) {
    return { ok: false, reason: NO_MATCHING_CHALLENGE };
  }

  const intensityMin = getIntensityMin(round);
  const closeContent = (c: Challenge) =>
    contentLevelDistance(c.contentLevel, settings.contentLevel) <= 1;
  const vibeOk = (c: Challenge) => matchesVibes(c, settings);
  const intenseOk = (c: Challenge) => c.intensity >= intensityMin;

  const tiers: {
    pool: Challenge[];
    relaxed: "none" | "content" | "intensity" | "vibes";
  }[] = [
    {
      pool: hard.filter((c) => intenseOk(c) && vibeOk(c) && closeContent(c)),
      relaxed: "none",
    },
    {
      pool: hard.filter((c) => intenseOk(c) && vibeOk(c)),
      relaxed: "content",
    },
    {
      pool: hard.filter((c) => vibeOk(c)),
      relaxed: "intensity",
    },
    { pool: hard, relaxed: "vibes" },
  ];

  for (const tier of tiers) {
    if (tier.pool.length >= MIN_TIER_CHOICES) {
      return {
        ok: true,
        challenge: weightedPick(tier.pool, settings, rng),
        relaxed: tier.relaxed,
      };
    }
  }

  let fallback = tiers[0];
  for (const tier of tiers) {
    if (tier.pool.length > fallback.pool.length) fallback = tier;
  }
  if (fallback.pool.length > 0) {
    return {
      ok: true,
      challenge: weightedPick(fallback.pool, settings, rng),
      relaxed: fallback.relaxed,
    };
  }

  return { ok: false, reason: NO_MATCHING_CHALLENGE };
}

export const MIN_ADAPTED_DRINKS = 0.25;

/**
 * Curva siempre distinta: nivel bajo bebe más (ponerse al día hacia 7.5–8.5);
 * zona media ≈ base; sweet spot menos; fino casi un sorbo.
 * Usa el último nivel confirmado en una pausa.
 */
export function getDrinkMultiplier(drunkLevel: number): number {
  if (drunkLevel >= 9.5) return 0.25;
  if (drunkLevel >= 9) return 0.3;
  if (drunkLevel >= 8.5) return 0.4;
  if (drunkLevel >= 8) return 0.5;
  if (drunkLevel >= 7.5) return 0.6;
  if (drunkLevel >= 7) return 1;
  if (drunkLevel >= 6) return 1.1;
  if (drunkLevel >= 5) return 1.2;
  if (drunkLevel >= 4) return 1.5;
  if (drunkLevel >= 3) return 1.8;
  if (drunkLevel >= 2) return 2.1;
  return 2.4;
}

export function adjustDrinksForDrunkLevel(
  baseDrinks: number,
  drunkLevel: number
): number {
  const scaled = Math.max(0, baseDrinks) * getDrinkMultiplier(drunkLevel);
  const rounded = Math.round(scaled * 10) / 10;
  return Math.max(MIN_ADAPTED_DRINKS, rounded);
}

export function getSkipPenaltyDrinks(
  baseDrinks: number,
  drunkLevel: number
): number {
  return adjustDrinksForDrunkLevel(baseDrinks + 1, drunkLevel);
}

export function getIntensityMin(round: number): number {
  return Math.min(6, 1 + Math.floor(round / 4));
}

export function isFino(drunkLevel: number): boolean {
  return drunkLevel >= 8.5;
}

export function isInSweetSpot(drunkLevel: number): boolean {
  return drunkLevel >= 7.5 && drunkLevel <= 8.5;
}

export function shouldTriggerDrunkCheck(
  round: number,
  lastDrunkCheckRound: number
): boolean {
  return round > 0 && round % 4 === 0 && lastDrunkCheckRound !== round;
}

const SOBER_ALTERNATIVES = [
  "Bebe un vaso de agua con drama de telenovela (mínimo 10 segundos de acting).",
  "Haz 15 flexiones. Si fallas, el grupo te pone un nombre ridículo hasta la siguiente ronda.",
  "Confiesa algo vergonzoso que nunca has dicho en voz alta.",
  "Baila 30 segundos como si nadie te mirara (spoiler: todos miran).",
  "Imita a otro jugador hasta que alguien acierte quién es.",
  "Cuenta un chiste malo. Si nadie se ríe, repites el castigo.",
  "Haz el sonido de un animal cada vez que alguien hable durante 2 rondas.",
  "Sirve las bebidas del grupo como camarero VIP con actitud.",
  "Lee el último mensaje que enviaste en voz alta con tono dramático.",
  "Haz una selfie grupal haciendo la cara más fea posible (sin subir nada, solo enseñar).",
  "Narra en voz alta lo que hace {other} como documental de naturaleza.",
  "Pon cara de poker durante 1 minuto. Si sonríes, repites.",
  "Di 5 cosas buenas sobre {other} sin repetir palabras.",
  "Haz una voltereta o intenta una (el intento cuenta).",
  "Canta el estribillo de una canción que el grupo elija.",
];

export function pickSoberAlternative(otherName: string): string {
  const template =
    SOBER_ALTERNATIVES[Math.floor(Math.random() * SOBER_ALTERNATIVES.length)];
  return template.replace(/\{other\}/g, otherName);
}

export function personalizeText(
  text: string,
  targetName: string,
  otherNames: string[]
): string {
  let result = text.replace(/\{player\}/g, targetName);
  const other =
    otherNames.length > 0
      ? otherNames[Math.floor(Math.random() * otherNames.length)]
      : "alguien";
  result = result.replace(/\{other\}/g, other);
  result = result.replace(/\{todos\}/g, "todos");
  return result;
}

function prettyDrinkNumber(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(1);
}

export function formatDrinkAmount(amount: number): string {
  if (amount <= 0.3) return "un sorbo simbólico (ya vas alto/a)";
  if (amount <= 0.6) return "medio trago";
  if (amount <= 1) return "1 trago";
  if (amount <= 1.5) return "1 trago y medio";
  if (amount <= 2) return "2 tragos";
  return `${prettyDrinkNumber(amount)} tragos`;
}
