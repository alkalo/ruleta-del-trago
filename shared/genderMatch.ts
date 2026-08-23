import type { Challenge, GameSettings, Gender, OrientationPref } from "./types";
import { normalizeGender } from "./types";

export interface GenderedPlayer {
  id: string;
  gender?: Gender;
  connected?: boolean;
}

export type OtherGenderRule = "any" | "none" | Gender[];

export function playerGender(player: GenderedPlayer): Gender {
  return normalizeGender(player.gender);
}

function otherGendersForOrientation(
  targetGender: Gender,
  orientation: OrientationPref
): OtherGenderRule {
  switch (orientation) {
    case "neutro":
    case "bi":
    case "pan":
      return "any";
    case "gay":
      return targetGender === "hombre" ? ["hombre"] : "none";
    case "lesbiana":
      return targetGender === "mujer" ? ["mujer"] : "none";
    case "hetero":
      if (targetGender === "hombre") return ["mujer"];
      if (targetGender === "mujer") return ["hombre"];
      return "none";
    default:
      return "any";
  }
}

function mergeOtherGenderRules(rules: OtherGenderRule[]): OtherGenderRule {
  if (rules.includes("any")) return "any";
  const genders = new Set<Gender>();
  for (const rule of rules) {
    if (rule === "none" || rule === "any") continue;
    for (const gender of rule) genders.add(gender);
  }
  if (genders.size === 0) return "none";
  return [...genders];
}

function challengeGenderTheme(
  orients: OrientationPref[]
): "gay" | "lesbiana" | "hetero" | "flex" {
  if (orients.includes("neutro") || orients.length === 0) return "flex";
  const hasGay = orients.includes("gay");
  const hasLes = orients.includes("lesbiana");
  const hasHet = orients.includes("hetero");
  const exclusive = [hasGay, hasLes, hasHet].filter(Boolean).length;
  if (exclusive === 1) {
    if (hasGay) return "gay";
    if (hasLes) return "lesbiana";
    return "hetero";
  }
  return "flex";
}

/** Qué géneros valen como {other} para este target + reto. */
export function allowedOtherGenders(
  targetGender: Gender,
  challenge: Challenge,
  roomOrients: OrientationPref[]
): OtherGenderRule {
  const listed = challenge.orientations ?? [];
  const allowedRoom = roomOrients ?? [];
  const orients =
    listed.length === 0
      ? (["neutro"] as OrientationPref[])
      : listed.filter((o) => o === "neutro" || allowedRoom.includes(o));
  if (orients.length === 0) return "none";

  const theme = challengeGenderTheme(orients);
  if (theme === "gay") {
    return targetGender === "hombre" ? ["hombre"] : "none";
  }
  if (theme === "lesbiana") {
    return targetGender === "mujer" ? ["mujer"] : "none";
  }
  if (theme === "hetero") {
    if (targetGender === "hombre") return ["mujer"];
    if (targetGender === "mujer") return ["hombre"];
    return "none";
  }

  return mergeOtherGenderRules(
    orients.map((o) => otherGendersForOrientation(targetGender, o))
  );
}

export function canPlayerBeTarget(
  target: GenderedPlayer,
  challenge: Challenge,
  others: GenderedPlayer[],
  roomOrients: OrientationPref[]
): boolean {
  const needsOther = challenge.text.includes("{other}");
  const rule = allowedOtherGenders(playerGender(target), challenge, roomOrients);
  if (rule === "none") return false;
  if (!needsOther) return true;
  const pool = others.filter((p) => p.id !== target.id && p.connected !== false);
  if (pool.length === 0) return false;
  if (rule === "any") return true;
  return pool.some((o) => rule.includes(playerGender(o)));
}

export function challengeFitsRoomGenders(
  challenge: Challenge,
  players: GenderedPlayer[],
  settings: GameSettings
): boolean {
  const connected = players.filter((p) => p.connected !== false);
  if (connected.length === 0) return true;
  return connected.some((target) =>
    canPlayerBeTarget(target, challenge, connected, settings.orientations)
  );
}

export function challengeFitsTargets(
  challenge: Challenge,
  targets: GenderedPlayer[],
  allPlayers: GenderedPlayer[],
  roomOrients: OrientationPref[]
): boolean {
  if (targets.length === 0) {
    return challengeFitsRoomGenders(challenge, allPlayers, {
      orientations: roomOrients,
    } as GameSettings);
  }
  return targets.every((target) =>
    canPlayerBeTarget(target, challenge, allPlayers, roomOrients)
  );
}

export function pickOtherPlayer<T extends GenderedPlayer>(
  target: T,
  others: T[],
  challenge: Challenge,
  roomOrients: OrientationPref[],
  rng: () => number = Math.random
): T | undefined {
  const rule = allowedOtherGenders(playerGender(target), challenge, roomOrients);
  const pool =
    rule === "none"
      ? []
      : rule === "any"
        ? others.filter((p) => p.id !== target.id)
        : others.filter(
            (p) => p.id !== target.id && rule.includes(playerGender(p))
          );
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rng() * pool.length)];
}
