import { v4 as uuidv4 } from "uuid";
import type {
  Challenge,
  GameMode,
  GameSettings,
  Gender,
  Player,
  PlayerStats,
  RoomState,
  SessionAlert,
} from "../../shared/types.js";
import { normalizeGender } from "../../shared/types.js";
import {
  adjustDrinksForDrunkLevel,
  contentLevelAllowed,
  getIntensityMin,
  getSkipPenaltyDrinks,
  isFino,
  isInSweetSpot,
  matchesOrientation,
  NO_MATCHING_CHALLENGE,
  personalizeText,
  pickSoberAlternative,
  selectChallenge,
  shouldTriggerDrunkCheck,
} from "../../shared/gameLogic.js";
import {
  challengeFitsRoomGenders,
  challengeFitsTargets,
  pickOtherPlayer,
} from "../../shared/genderMatch.js";
import { getAllChallenges } from "./challenges.js";

const MODES: GameMode[] = [
  "cooperativo",
  "todos_contra_todos",
  "todos_contra_uno",
];

function emptyStats(): PlayerStats {
  return {
    timesSelected: 0,
    drinksTaken: 0,
    challengesCompleted: 0,
    challengesSkipped: 0,
    penaltiesTaken: 0,
  };
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** La confirmación de nivel vive en clientKey, no en socket.id (cambia al remapear). */
function drunkCheckKey(player: Player): string {
  return player.clientKey || player.id;
}

function hasSubmittedDrunkCheck(room: RoomState, player: Player): boolean {
  return (
    room.drunkCheckSubmitted[drunkCheckKey(player)] === true ||
    room.drunkCheckSubmitted[player.id] === true
  );
}

function writeDrunkCheck(
  room: RoomState,
  player: Player,
  value: boolean
): void {
  room.drunkCheckSubmitted[player.id] = value;
  if (player.clientKey) room.drunkCheckSubmitted[player.clientKey] = value;
}

function ensureDrunkCheckSlot(room: RoomState, player: Player): void {
  if (room.phase !== "drunk_check") return;
  if (!hasSubmittedDrunkCheck(room, player)) {
    writeDrunkCheck(room, player, false);
  }
}

function resetDrunkCheckSubmissions(room: RoomState): void {
  room.drunkCheckSubmitted = {};
  for (const p of room.players.filter((pl) => pl.connected)) {
    writeDrunkCheck(room, p, false);
  }
}

function allDrunkCheckSubmitted(room: RoomState): boolean {
  const active = room.players.filter((p) => p.connected);
  return (
    active.length > 0 && active.every((p) => hasSubmittedDrunkCheck(room, p))
  );
}

/** Si el último pendiente se desconecta, no dejes la pausa colgada. */
function tryAdvanceDrunkCheck(room: RoomState, addInfoAlert: (message: string) => void): void {
  if (room.phase !== "drunk_check") return;
  if (!allDrunkCheckSubmitted(room)) return;

  room.lastDrunkCheckRound = room.round;
  room.phase = "challenge";

  const active = room.players.filter((p) => p.connected);
  const allSweet =
    active.length > 0 && active.every((p) => isInSweetSpot(p.drunkLevel));
  if (allSweet && room.round > 0) {
    addInfoAlert(
      "🎉 ¡NIVEL PERFECTO! Todos entre 7.5 y 8.5. Sois unos profesionales."
    );
    room.phase = "ended";
  }
}

function remapIdList(ids: string[], oldId: string, newId: string): string[] {
  return ids.map((id) => (id === oldId ? newId : id));
}

function remapRecordKey<T>(
  record: Record<string, T> | undefined,
  oldId: string,
  newId: string
): void {
  if (!record || oldId === newId || !Object.prototype.hasOwnProperty.call(record, oldId)) {
    return;
  }
  record[newId] = record[oldId];
  delete record[oldId];
}

/** Al reconectar el socket.id cambia: hay que actualizar todos los arrays de la ronda. */
function remapPlayerId(room: RoomState, oldId: string, newId: string): void {
  if (!oldId || !newId || oldId === newId) return;

  room.currentTargets = remapIdList(room.currentTargets, oldId, newId);
  room.resolvedTargets = remapIdList(room.resolvedTargets, oldId, newId);
  room.spinPlayerIds = remapIdList(room.spinPlayerIds, oldId, newId);
  if (room.spinWinnerId === oldId) room.spinWinnerId = newId;
  if (room.lastSelectedId === oldId) room.lastSelectedId = newId;
  if (room.hostId === oldId) room.hostId = newId;

  if (room.activeSpin) {
    room.activeSpin.targets = remapIdList(room.activeSpin.targets, oldId, newId);
    remapRecordKey(room.activeSpin.drinkAmounts, oldId, newId);
    remapRecordKey(
      (room.activeSpin as { skipDrinkAmounts?: Record<string, number> }).skipDrinkAmounts,
      oldId,
      newId
    );
    remapRecordKey(room.activeSpin.soberAlternatives, oldId, newId);
    remapRecordKey(room.activeSpin.displayTexts, oldId, newId);
  }

  for (const alert of room.sessionAlerts) {
    if (alert.playerId === oldId) alert.playerId = newId;
  }
}

/** Targets aún sin resolver. IDs huérfanos (tras un remap fallido) no bloquean. */
function pendingTargetIds(room: RoomState): string[] {
  const ids = room.activeSpin?.targets ?? [];
  return ids.filter((id) => {
    if (room.resolvedTargets.includes(id)) return false;
    return room.players.some((p) => p.id === id);
  });
}

function pendingTargetNames(room: RoomState): string {
  return pendingTargetIds(room)
    .map((id) => room.players.find((p) => p.id === id)?.name ?? "alguien")
    .join(", ");
}

function clearSpinIfResolved(room: RoomState): void {
  if (room.activeSpin && pendingTargetIds(room).length === 0) {
    room.activeSpin = null;
  }
}

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  createRoom(hostId: string, clientKey?: string): RoomState {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const host: Player = {
      id: hostId,
      name: "Host",
      gender: "otro",
      clientKey: clientKey || uuidv4(),
      drunkLevel: 5,
      drinksAlcohol: true,
      isHost: true,
      connected: true,
      stats: emptyStats(),
      isFino: false,
    };

    const room: RoomState = {
      code,
      phase: "setup",
      settings: null,
      players: [host],
      hostId,
      round: 0,
      lastSelectedId: null,
      currentMode: null,
      currentChallenge: null,
      currentTargets: [],
      spinPlayerIds: [],
      spinWinnerId: null,
      spinTurns: 6,
      drunkCheckRound: 0,
      sessionAlerts: [],
      customChallenges: [],
      activeSpin: null,
      resolvedTargets: [],
      lastDrunkCheckRound: -1,
      drunkCheckSubmitted: { [drunkCheckKey(host)]: false },
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): RoomState | undefined {
    if (!code) return undefined;
    return this.rooms.get(code.trim().toUpperCase());
  }

  /** Reengancha un socket ya conocido (misma pestaña) sin crear jugador nuevo. */
  attachSocket(
    code: string,
    socketId: string,
    identity?: { clientKey?: string; name?: string }
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.players.some((p) => p.id === socketId)) return room;

    const byKey = identity?.clientKey
      ? room.players.find(
          (p) => p.clientKey && p.clientKey === identity.clientKey
        )
      : undefined;
    if (!byKey) return null;

    const oldId = byKey.id;
    if (byKey.isHost) room.hostId = socketId;
    byKey.id = socketId;
    byKey.connected = true;
    remapPlayerId(room, oldId, socketId);
    ensureDrunkCheckSlot(room, byKey);
    return room;
  }

  joinRoom(
    code: string,
    playerId: string,
    name: string,
    drunkLevel: number,
    drinksAlcohol: boolean,
    gender?: Gender,
    clientKey?: string
  ): JoinRoomResult {
    const room = this.getRoom(code);
    if (!room) return { ok: false, errorCode: "ROOM_EXPIRED" };
    const resolvedGender = normalizeGender(gender);
    const trimmedName = name.trim();

    const claim = (player: Player): JoinRoomResult => {
      const oldId = player.id;
      if (player.isHost) room.hostId = playerId;
      player.id = playerId;
      player.connected = true;
      if (clientKey) player.clientKey = clientKey;
      if (trimmedName) player.name = trimmedName;
      player.gender = resolvedGender;
      player.drinksAlcohol = drinksAlcohol;
      if (room.phase === "setup" || room.phase === "lobby") {
        player.drunkLevel = Math.min(10, Math.max(1, drunkLevel));
        player.isFino = isFino(player.drunkLevel);
      }
      remapPlayerId(room, oldId, playerId);
      ensureDrunkCheckSlot(room, player);
      return { ok: true, room };
    };

    const existing = room.players.find((p) => p.id === playerId);
    if (existing) return claim(existing);

    if (clientKey) {
      const existingByKey = room.players.find(
        (p) => p.clientKey && p.clientKey === clientKey
      );
      if (existingByKey) return claim(existingByKey);
    }

    const existingByName =
      trimmedName.length > 0
        ? room.players.find(
            (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
          )
        : undefined;
    if (existingByName) {
      const samePerson =
        !!existingByName.clientKey &&
        !!clientKey &&
        existingByName.clientKey === clientKey;
      if (existingByName.connected && existingByName.id !== playerId && !samePerson) {
        return { ok: false, errorCode: "NAME_TAKEN" };
      }
      if (
        existingByName.clientKey &&
        clientKey &&
        existingByName.clientKey !== clientKey
      ) {
        return { ok: false, errorCode: "NAME_TAKEN" };
      }
      return claim(existingByName);
    }

    if (room.phase === "setup") {
      return { ok: false, errorCode: "SETUP_IN_PROGRESS" };
    }

    if (room.phase !== "lobby") {
      return { ok: false, errorCode: "GAME_IN_PROGRESS" };
    }

    if (room.players.filter((p) => p.connected).length >= 20) {
      return { ok: false, errorCode: "ROOM_FULL" };
    }

    const player: Player = {
      id: playerId,
      name: trimmedName || name,
      gender: resolvedGender,
      clientKey,
      drunkLevel: Math.min(10, Math.max(1, drunkLevel)),
      drinksAlcohol,
      isHost: false,
      connected: true,
      stats: emptyStats(),
      isFino: isFino(drunkLevel),
    };

    room.players.push(player);
    writeDrunkCheck(room, player, false);
    return { ok: true, room };
  }

  rejoinHost(
    code: string,
    socketId: string,
    name?: string,
    clientKey?: string
  ): JoinRoomResult {
    const room = this.getRoom(code);
    if (!room) return { ok: false, errorCode: "ROOM_EXPIRED" };

    const host = room.players.find((p) => p.isHost);
    if (!host) return { ok: false, errorCode: "ROOM_EXPIRED" };

    const keyMatches =
      !!clientKey && !!host.clientKey && host.clientKey === clientKey;
    const nameMatches =
      !!name &&
      name.trim().length > 0 &&
      host.name.toLowerCase() === name.trim().toLowerCase();

    if (clientKey && host.clientKey && host.clientKey !== clientKey) {
      return { ok: false, errorCode: "NOT_HOST" };
    }

    // F5 del host: el socket.id cambia y el viejo puede seguir "connected".
    if (
      host.connected &&
      host.id !== socketId &&
      !keyMatches &&
      !nameMatches
    ) {
      return { ok: false, errorCode: "NOT_HOST" };
    }

    const oldId = host.id;
    host.id = socketId;
    host.connected = true;
    if (clientKey) host.clientKey = clientKey;
    if (name?.trim()) host.name = name.trim();
    room.hostId = socketId;
    remapPlayerId(room, oldId, socketId);
    ensureDrunkCheckSlot(room, host);

    return { ok: true, room };
  }

  setHostSettings(code: string, hostId: string, settings: GameSettings): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    room.settings = settings;
    room.phase = "lobby";
    return room;
  }

  startGame(
    code: string,
    hostId: string
  ): { room: RoomState | null; error?: string } {
    const room = this.getRoom(code);
    if (!room) return { room: null, error: "Sala no encontrada. Crea otra." };
    if (room.hostId !== hostId) {
      return { room: null, error: "No eres el host. Recarga la página." };
    }
    if (!room.settings) {
      return { room: null, error: "Falta la configuración de la sala." };
    }
    if (room.players.filter((p) => p.connected).length < 2) {
      return {
        room: null,
        error: "Necesitas al menos 2 jugadores conectados.",
      };
    }

    room.phase = "drunk_check";
    room.round = 0;
    room.drunkCheckRound = 1;
    resetDrunkCheckSubmissions(room);
    return { room };
  }

  submitDrunkLevel(
    code: string,
    playerId: string,
    level: number,
    identity?: { name?: string; clientKey?: string }
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.phase !== "drunk_check") return null;

    let player = room.players.find((p) => p.id === playerId);
    if (!player && identity?.clientKey) {
      player = room.players.find((p) => p.clientKey === identity.clientKey);
    }
    if (!player && identity?.name?.trim()) {
      const n = identity.name.trim().toLowerCase();
      player = room.players.find((p) => p.name.toLowerCase() === n);
    }
    if (!player) return null;

    if (player.id !== playerId) {
      const oldId = player.id;
      player.id = playerId;
      if (player.isHost) room.hostId = playerId;
      remapPlayerId(room, oldId, playerId);
    }
    player.connected = true;
    if (identity?.clientKey) player.clientKey = identity.clientKey;

    player.drunkLevel = Math.min(10, Math.max(1, level));
    player.isFino = isFino(player.drunkLevel);
    writeDrunkCheck(room, player, true);

    if (player.isFino) {
      this.addAlert(
        room,
        "fino",
        `🍻 ${player.name} ya va FINO (${player.drunkLevel}/10). La sala entera lo sabe.`,
        player.id
      );
    }

    tryAdvanceDrunkCheck(room, (message) => this.addAlert(room, "info", message));
    return room;
  }

  finishDrunkCheck(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.lastDrunkCheckRound = room.round;
    room.phase = "challenge";
    return room;
  }

  beginSpin(code: string, hostId: string): BeginSpinResult {
    const room = this.getRoom(code);
    if (!room) {
      return { room: null, error: "Sala no encontrada. Recarga la página." };
    }
    if (room.hostId !== hostId) {
      return {
        room: null,
        error: "No eres el host de esta sala. Recarga y reconecta.",
      };
    }
    if (room.phase !== "challenge") {
      return {
        room: null,
        error: "Ahora no se puede girar. Espera a que toque.",
      };
    }

    const pending = pendingTargetIds(room);
    if (pending.length > 0) {
      return {
        room: null,
        error: `Falta que marquen: ${pendingTargetNames(room)}`,
      };
    }

    room.activeSpin = null;

    if (shouldTriggerDrunkCheck(room.round, room.lastDrunkCheckRound)) {
      room.phase = "drunk_check";
      room.drunkCheckRound++;
      resetDrunkCheckSubmissions(room);
      return { room };
    }

    room.phase = "spinning";
    const active = room.players.filter((p) => p.connected);
    room.spinPlayerIds = active.map((p) => p.id);
    const pickable = active.filter((p) => this.pickChallenge(room, [p]));
    const source = pickable.length > 0 ? pickable : active;
    const candidates = source.filter((p) => p.id !== room.lastSelectedId);
    const pool = candidates.length > 0 ? candidates : source;
    const winner = pool[Math.floor(Math.random() * pool.length)];
    room.spinWinnerId = winner?.id ?? null;
    room.spinTurns = 6;
    return { room };
  }

  completeSpin(code: string, hostId: string): CompleteSpinResult {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId || room.phase !== "spinning") {
      return { ok: false, error: "No se puede completar el giro ahora." };
    }
    if (!room.settings) {
      return { ok: false, error: "La sala no tiene configuración." };
    }

    room.round++;
    const active = room.players.filter((p) => p.connected);
    if (active.length === 0) {
      room.round--;
      return { ok: false, error: "No hay jugadores conectados.", room };
    }

    const mode = MODES[Math.floor(Math.random() * MODES.length)];
    room.currentMode = mode;

    const winner =
      active.find((p) => p.id === room.spinWinnerId) ??
      active.find((p) => p.id !== room.lastSelectedId) ??
      active[0];
    const targets = [winner];
    room.lastSelectedId = winner.id;

    for (const t of targets) {
      t.stats.timesSelected++;
    }

    const challenge = this.pickChallenge(room, targets);
    if (!challenge) {
      room.round--;
      room.phase = "challenge";
      room.activeSpin = null;
      this.addAlert(room, "warning", NO_MATCHING_CHALLENGE);
      return { ok: false, error: NO_MATCHING_CHALLENGE, room };
    }

    room.currentChallenge = challenge;
    room.currentTargets = targets.map((t) => t.id);
    room.phase = "challenge";

    const roomOrients = room.settings.orientations ?? [];
    const drinkAmounts: Record<string, number> = {};
    const skipDrinkAmounts: Record<string, number> = {};
    const soberAlternatives: Record<string, string> = {};
    const displayTexts: Record<string, string> = {};

    for (const target of targets) {
      const other = pickOtherPlayer(target, active, challenge, roomOrients);
      const text = personalizeText(
        challenge.text,
        target.name,
        other ? [other.name] : []
      );
      displayTexts[target.id] = text;

      if (target.drinksAlcohol) {
        drinkAmounts[target.id] = adjustDrinksForDrunkLevel(
          challenge.baseDrinks,
          target.drunkLevel
        );
        skipDrinkAmounts[target.id] = getSkipPenaltyDrinks(
          challenge.baseDrinks,
          target.drunkLevel
        );
      } else {
        soberAlternatives[target.id] = pickSoberAlternative(
          other?.name ?? "alguien"
        );
      }
    }

    room.activeSpin = {
      targets: targets.map((t) => t.id),
      mode,
      challenge,
      drinkAmounts,
      skipDrinkAmounts,
      soberAlternatives,
      displayTexts,
    };
    room.resolvedTargets = [];

    for (const target of targets) {
      if (target.stats.penaltiesTaken >= 8) {
        this.addAlert(
          room,
          "warning",
          `⚠️ ${target.name} lleva muchas penalizaciones. El grupo decide si hay margen.`,
          target.id
        );
      }
    }

    return {
      ok: true,
      outcome: {
        room,
        targets: targets.map((t) => t.id),
        mode,
        challenge,
        drinkAmounts,
        skipDrinkAmounts,
        soberAlternatives,
        displayTexts,
      },
    };
  }

  hostMarkDrank(
    code: string,
    hostId: string,
    targetPlayerId: string
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    if (!room.activeSpin?.targets.includes(targetPlayerId)) return null;
    if (room.resolvedTargets.includes(targetPlayerId)) {
      clearSpinIfResolved(room);
      return room;
    }
    const result = this.markDrank(code, targetPlayerId);
    if (!result) return null;
    result.resolvedTargets.push(targetPlayerId);
    clearSpinIfResolved(result);
    return result;
  }

  hostMarkCompleted(
    code: string,
    hostId: string,
    targetPlayerId: string
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    if (!room.activeSpin?.targets.includes(targetPlayerId)) return null;
    if (room.resolvedTargets.includes(targetPlayerId)) {
      clearSpinIfResolved(room);
      return room;
    }
    const result = this.markCompleted(code, targetPlayerId);
    if (!result) return null;
    result.resolvedTargets.push(targetPlayerId);
    clearSpinIfResolved(result);
    return result;
  }

  hostMarkSkipped(
    code: string,
    hostId: string,
    targetPlayerId: string
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    if (!room.activeSpin?.targets.includes(targetPlayerId)) return null;
    if (room.resolvedTargets.includes(targetPlayerId)) {
      clearSpinIfResolved(room);
      return room;
    }
    const result = this.markSkipped(code, targetPlayerId);
    if (!result) return null;
    result.resolvedTargets.push(targetPlayerId);
    clearSpinIfResolved(result);
    return result;
  }

  playerMarkDrank(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || !room.activeSpin?.targets.includes(playerId)) return null;
    if (room.resolvedTargets.includes(playerId)) {
      clearSpinIfResolved(room);
      return room;
    }
    const result = this.markDrank(code, playerId);
    if (!result) return null;
    result.resolvedTargets.push(playerId);
    clearSpinIfResolved(result);
    return result;
  }

  playerMarkCompleted(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || !room.activeSpin?.targets.includes(playerId)) return null;
    if (room.resolvedTargets.includes(playerId)) {
      clearSpinIfResolved(room);
      return room;
    }
    const result = this.markCompleted(code, playerId);
    if (!result) return null;
    result.resolvedTargets.push(playerId);
    clearSpinIfResolved(result);
    return result;
  }

  playerMarkSkipped(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || !room.activeSpin?.targets.includes(playerId)) return null;
    if (room.resolvedTargets.includes(playerId)) {
      clearSpinIfResolved(room);
      return room;
    }
    const result = this.markSkipped(code, playerId);
    if (!result) return null;
    result.resolvedTargets.push(playerId);
    clearSpinIfResolved(result);
    return result;
  }

  markDrank(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    const drank = room.activeSpin?.drinkAmounts[playerId] ?? 0;
    player.stats.drinksTaken += drank;
    player.stats.challengesCompleted++;
    return room;
  }

  markCompleted(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    player.stats.challengesCompleted++;
    return room;
  }

  markSkipped(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    player.stats.challengesSkipped++;
    player.stats.penaltiesTaken++;

    if (player.drinksAlcohol) {
      const penalty =
        room.activeSpin?.skipDrinkAmounts?.[playerId] ??
        room.activeSpin?.drinkAmounts[playerId] ??
        0;
      player.stats.drinksTaken += penalty;
    }

    return room;
  }

  continueAfterVictory(code: string, hostId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId || room.phase !== "ended") return null;
    room.phase = "challenge";
    room.activeSpin = null;
    room.resolvedTargets = [];
    room.currentTargets = [];
    room.currentChallenge = null;
    room.currentMode = null;
    return room;
  }

  disconnectPlayer(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    tryAdvanceDrunkCheck(room, (message) => this.addAlert(room, "info", message));
    return room;
  }

  updateHostName(code: string, hostId: string, name: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    const host = room.players.find((p) => p.id === hostId);
    if (host) host.name = name;
    return room;
  }

  updateHostProfile(
    code: string,
    hostId: string,
    data: {
      name?: string;
      drunkLevel?: number;
      drinksAlcohol?: boolean;
      gender?: Gender;
    }
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    const host = room.players.find((p) => p.id === hostId);
    if (!host) return null;
    if (data.name) host.name = data.name;
    if (data.gender !== undefined) host.gender = normalizeGender(data.gender);
    if (
      data.drunkLevel !== undefined &&
      (room.phase === "setup" || room.phase === "lobby")
    ) {
      host.drunkLevel = Math.min(10, Math.max(1, data.drunkLevel));
      host.isFino = isFino(host.drunkLevel);
    }
    if (data.drinksAlcohol !== undefined) host.drinksAlcohol = data.drinksAlcohol;
    return room;
  }

  private pickChallenge(room: RoomState, targets: Player[] = []): Challenge | null {
    if (!room.settings) return null;

    const all = getAllChallenges(room.customChallenges);
    const active = room.players.filter((p) => p.connected);

    const filtered = all.filter((c) => {
      if (!room.settings!.challengeTypes.includes(c.type)) return false;
      if (!contentLevelAllowed(c.contentLevel, room.settings!.contentLevel))
        return false;
      if (c.type === "strip" && !room.settings!.stripEnabled) return false;
      const orientations = room.settings!.orientations ?? [];
      const challengeOrients = c.orientations ?? [];
      if (!matchesOrientation(challengeOrients, orientations)) return false;
      if (
        !room.settings!.coupleChallengesEnabled &&
        (c.type === "couple" ||
          (challengeOrients.length > 0 && !challengeOrients.includes("neutro")))
      )
        return false;
      if (!challengeFitsRoomGenders(c, active, room.settings!)) return false;
      if (!challengeFitsTargets(c, targets, active, orientations))
        return false;
      return true;
    });

    if (filtered.length === 0) return null;
    const picked = selectChallenge(filtered, room.settings, room.round);
    return picked.ok ? picked.challenge : null;
  }

  private addAlert(
    room: RoomState,
    type: SessionAlert["type"],
    message: string,
    playerId?: string
  ): void {
    room.sessionAlerts.push({
      id: uuidv4(),
      type,
      message,
      playerId,
      timestamp: Date.now(),
    });
    if (room.sessionAlerts.length > 20) {
      room.sessionAlerts = room.sessionAlerts.slice(-20);
    }
  }
}

export type JoinErrorCode =
  | "ROOM_EXPIRED"
  | "GAME_IN_PROGRESS"
  | "SETUP_IN_PROGRESS"
  | "ROOM_FULL"
  | "NOT_HOST"
  | "NAME_TAKEN";

export type JoinRoomResult =
  | { ok: true; room: RoomState }
  | { ok: false; errorCode: JoinErrorCode };

export interface BeginSpinResult {
  room: RoomState | null;
  error?: string;
}

export interface SpinOutcome {
  room: RoomState;
  targets: string[];
  mode: GameMode;
  challenge: Challenge;
  drinkAmounts: Record<string, number>;
  skipDrinkAmounts: Record<string, number>;
  soberAlternatives: Record<string, string>;
  displayTexts: Record<string, string>;
}

export type CompleteSpinResult =
  | { ok: true; outcome: SpinOutcome }
  | { ok: false; error: string; room?: RoomState };
