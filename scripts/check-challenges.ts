/**
 * Chequeo del pack: tags honestos + cobertura + el filtro no sirve basura.
 * Ejecutar: npx tsx scripts/check-challenges.ts
 */
import { INITIAL_CHALLENGES } from "../server/src/challenges.ts";
import {
  filterHardConstraints,
  selectChallenge,
} from "../shared/gameLogic.ts";
import type { GameSettings } from "../shared/types.ts";

const errors: string[] = [];
function fail(msg: string) {
  errors.push(msg);
}

const pack = INITIAL_CHALLENGES;
if (pack.length < 250 || pack.length > 400) {
  fail(`Pack fuera de rango 250–400: ${pack.length}`);
}

const ids = pack.map((c) => c.id);
if (new Set(ids).size !== ids.length) fail("IDs duplicados");

const QUESTIONY =
  /¿|tú haces pregunta|si alguien ya lo hizo|yo nunca|never have/i;
for (const c of pack) {
  if (c.type === "physical" && QUESTIONY.test(c.text)) {
    fail(`physical con texto de pregunta: ${c.id} — ${c.text}`);
  }
  if (
    c.contentLevel === "picante" &&
    c.type === "minigame" &&
    /tú haces pregunta|si alguien ya lo hizo/i.test(c.text)
  ) {
    fail(`minigame picante genérico: ${c.id}`);
  }
}

const heteroAssume =
  /besa a una (chica|tía|mujer)|ligar(te)? a una chica|tu novia|una tía al azar/i;
for (const c of pack) {
  const gayCoded =
    c.orientations.includes("gay") &&
    !c.orientations.includes("hetero") &&
    !c.orientations.includes("lesbiana") &&
    !c.orientations.includes("neutro");
  if (gayCoded && heteroAssume.test(c.text)) {
    fail(`gay con supuesto hetero: ${c.id} — ${c.text}`);
  }
}

function countCombo(
  type: GameSettings["challengeTypes"][number],
  orients: GameSettings["orientations"],
  level: GameSettings["contentLevel"]
) {
  const settings: GameSettings = {
    vibes: ["risas", "locura", "competicion", "intimidad"],
    challengeTypes: [type],
    coupleChallengesEnabled: true,
    orientations: orients,
    contentLevel: level,
    stripEnabled: type === "strip",
  };
  return filterHardConstraints(pack, settings).filter((c) =>
    c.orientations.some((o) => orients.includes(o))
  ).length;
}

const gayPhysPic = pack.filter(
  (c) =>
    c.type === "physical" &&
    c.contentLevel === "picante" &&
    c.orientations.includes("gay")
).length;
if (gayPhysPic < 8) {
  fail(`Faltan physical+gay+picante (hay ${gayPhysPic}, mínimo 8)`);
}

for (const [label, n] of [
  ["physical+lesbiana+picante", countCombo("physical", ["lesbiana"], "picante")],
  ["physical+hetero+picante", countCombo("physical", ["hetero"], "picante")],
] as const) {
  if (n < 6) fail(`Cobertura floja ${label}: ${n}`);
}

const coupleOrients = ["hetero", "gay", "lesbiana", "bi", "pan"] as const;
for (const o of coupleOrients) {
  for (const level of ["medio", "picante", "sin_limite"] as const) {
    const n = pack.filter(
      (c) =>
        c.type === "couple" &&
        c.contentLevel === level &&
        c.orientations.includes(o)
    ).length;
    if (n < 1) fail(`Falta couple+${o}+${level}`);
  }
}

const settingsGayPhys: GameSettings = {
  vibes: ["risas", "locura", "competicion"],
  challengeTypes: ["physical"],
  coupleChallengesEnabled: true,
  orientations: ["gay"],
  contentLevel: "picante",
  stripEnabled: false,
};

const hard = filterHardConstraints(pack, settingsGayPhys);
const gayHard = hard.filter((c) => c.orientations.includes("gay"));
if (gayHard.length < 8) {
  fail(
    `Pool gay+physical+picante con gay explícito: ${gayHard.length} (mínimo 8)`
  );
}

const seenRecent: string[] = [];
for (let i = 0; i < 40; i++) {
  const pick = selectChallenge(
    pack,
    settingsGayPhys,
    i,
    [],
    Math.random,
    seenRecent
  );
  if (!pick.ok) {
    fail(`selectChallenge falló en ronda ${i}: ${pick.reason}`);
    break;
  }
  if (pick.challenge.type !== "physical") {
    fail(`Se coló tipo ${pick.challenge.type} en physical-only (${pick.challenge.id})`);
    break;
  }
  if (pick.challenge.type === "minigame") {
    fail(`Se coló un minigame: ${pick.challenge.id}`);
    break;
  }
  if (i > 0 && pick.challenge.id === seenRecent[seenRecent.length - 1]) {
    fail(`Mismo reto dos veces seguidas: ${pick.challenge.id}`);
    break;
  }
  seenRecent.push(pick.challenge.id);
}

const failSettings: GameSettings = {
  ...settingsGayPhys,
  challengeTypes: ["strip"],
  stripEnabled: false,
};
const empty = selectChallenge(pack, failSettings, 1);
if (empty.ok) {
  fail("El filtro sirvió strip con stripEnabled=false");
}

if (errors.length) {
  console.error("check-challenges FALLÓ:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(
  `OK: ${pack.length} retos. gay+physical+picante explícitos=${gayPhysPic}. El filtro no sirve minijuegos en physical-only.`
);
