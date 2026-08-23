import type { ContentLevel } from "./types";

const LEVEL_ORDER: ContentLevel[] = ["suave", "medio", "picante", "sin_limite"];

export function contentLevelAllowed(
  challengeLevel: ContentLevel,
  maxLevel: ContentLevel
): boolean {
  return LEVEL_ORDER.indexOf(challengeLevel) <= LEVEL_ORDER.indexOf(maxLevel);
}

/** Multiplicador de tragos según nivel de borrachera (objetivo 7.5–8.5). */
export function getDrinkMultiplier(drunkLevel: number): number {
  if (drunkLevel >= 8.5) return 0.2;
  if (drunkLevel >= 8) return 0.35;
  if (drunkLevel >= 7.5) return 0.5;
  if (drunkLevel >= 7) return 0.7;
  if (drunkLevel >= 6) return 0.85;
  if (drunkLevel >= 5) return 1;
  if (drunkLevel >= 4) return 1.25;
  if (drunkLevel >= 3) return 1.5;
  if (drunkLevel >= 2) return 1.75;
  return 2;
}

export function getIntensityMin(round: number): number {
  return Math.min(10, 1 + Math.floor(round / 2));
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

export function formatDrinkAmount(amount: number): string {
  if (amount <= 0.3) return "un sorbo simbólico (ya vas fino, crack)";
  if (amount <= 0.6) return "medio trago";
  if (amount <= 1) return "1 trago";
  if (amount <= 1.5) return "1 trago y medio";
  if (amount <= 2) return "2 tragos";
  return `${Math.round(amount)} tragos (el grupo dice que te lo has ganado)`;
}
