import { v4 as uuidv4 } from "uuid";
import type {
  Challenge,
  GameMode,
  GameSettings,
  Player,
  PlayerStats,
  RoomState,
  SessionAlert,
} from "../../shared/types.js";
import {
  contentLevelAllowed,
  getDrinkMultiplier,
  getIntensityMin,
  isFino,
  isInSweetSpot,
  personalizeText,
  pickSoberAlternative,
  shouldTriggerDrunkCheck,
} from "../../shared/gameLogic.js";
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

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  createRoom(hostId: string): RoomState {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const host: Player = {
      id: hostId,
      name: "Host",
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
      drunkCheckRound: 0,
      sessionAlerts: [],
      customChallenges: [],
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): RoomState | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  joinRoom(
    code: string,
    playerId: string,
    name: string,
    drunkLevel: number,
    drinksAlcohol: boolean
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.phase !== "lobby") return null;

    const existing = room!.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.name = name;
      existing.drunkLevel = drunkLevel;
      existing.drinksAlcohol = drinksAlcohol;
      return room!;
    }

    if (room!.players.filter((p) => p.connected).length >= 20) return null;

    const player: Player = {
      id: playerId,
      name,
      drunkLevel: Math.min(10, Math.max(1, drunkLevel)),
      drinksAlcohol,
      isHost: false,
      connected: true,
      stats: emptyStats(),
      isFino: isFino(drunkLevel),
    };

    room!.players.push(player);
    return room!;
  }

  setHostSettings(code: string, settings: GameSettings): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.settings = settings;
    room.phase = "lobby";
    return room;
  }

  startGame(code: string, hostId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId || !room.settings) return null;
    if (room.players.filter((p) => p.connected).length < 2) return null;

    room.phase = "drunk_check";
    room.round = 0;
    room.drunkCheckRound = 1;
    return room;
  }

  updateDrunkLevels(
    code: string,
    updates: Record<string, number>
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    for (const player of room.players) {
      const level = updates[player.id];
      if (level !== undefined) {
        player.drunkLevel = Math.min(10, Math.max(1, level));
        player.isFino = isFino(player.drunkLevel);
        if (player.isFino) {
          this.addAlert(
            room,
            "fino",
            `🍻 ${player.name} ya va FINO (${player.drunkLevel}/10). La sala entera lo sabe.`,
            player.id
          );
        }
      }
    }

    if (room.phase === "drunk_check") {
      room.phase = "challenge";
      if (room.round === 0) {
        room.phase = "challenge";
      }
    }

  // Check if all in sweet spot
    const active = room.players.filter((p) => p.connected);
    const allSweet = active.every((p) => isInSweetSpot(p.drunkLevel));
    if (allSweet && active.length > 0) {
      this.addAlert(
        room,
        "info",
        "🎉 ¡NIVEL PERFECTO! Todos entre 7.5 y 8.5. Ereses unos profesionales."
      );
    }

    return room;
  }

  finishDrunkCheck(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = "challenge";
    return room;
  }

  addCustomChallenge(code: string, hostId: string, challenge: Omit<Challenge, "id">): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;

    const full: Challenge = {
      ...challenge,
      id: `custom-${uuidv4().slice(0, 8)}`,
      custom: true,
    };
    room.customChallenges.push(full);
    return room;
  }

  beginSpin(code: string, hostId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    if (room.phase !== "challenge") return null;

    if (shouldTriggerDrunkCheck(room.round)) {
      room.phase = "drunk_check";
      room.drunkCheckRound++;
      return room;
    }

    room.phase = "spinning";
    const active = room.players.filter((p) => p.connected);
    room.spinPlayerIds = active.map((p) => p.id);
    return room;
  }

  completeSpin(code: string, hostId: string): SpinOutcome | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId || room.phase !== "spinning") return null;
    if (!room.settings) return null;

    room.round++;
    const active = room.players.filter((p) => p.connected);
    if (active.length === 0) return null;

    const mode = MODES[Math.floor(Math.random() * MODES.length)];
    room.currentMode = mode;

    let targets: Player[];
    const pickEveryone = Math.random() < 0.15 && active.length > 2;

    if (pickEveryone) {
      targets = active;
    } else if (mode === "todos_contra_uno") {
      const candidates = active.filter((p) => p.id !== room.lastSelectedId);
      const pool = candidates.length > 0 ? candidates : active;
      const target = pool[Math.floor(Math.random() * pool.length)];
      targets = [target];
    } else {
      const candidates = active.filter((p) => p.id !== room.lastSelectedId);
      const pool = candidates.length > 0 ? candidates : active;
      const target = pool[Math.floor(Math.random() * pool.length)];
      targets = mode === "cooperativo" ? active : [target];
    }

    if (!pickEveryone && targets.length === 1) {
      room.lastSelectedId = targets[0].id;
    }

    for (const t of targets) {
      t.stats.timesSelected++;
    }

    const challenge = this.pickChallenge(room);
    if (!challenge) return null;

    room.currentChallenge = challenge;
    room.currentTargets = targets.map((t) => t.id);
    room.phase = "challenge";

    const otherNames = active
      .filter((p) => !targets.find((t) => t.id === p.id))
      .map((p) => p.name);

    const drinkAmounts: Record<string, number> = {};
    const soberAlternatives: Record<string, string> = {};
    const displayTexts: Record<string, string> = {};

    for (const target of targets) {
      const text = personalizeText(challenge.text, target.name, otherNames);
      displayTexts[target.id] = text;

      if (target.drinksAlcohol) {
        const mult = getDrinkMultiplier(target.drunkLevel);
        drinkAmounts[target.id] = Math.max(
          0.25,
          Math.round(challenge.baseDrinks * mult * 10) / 10
        );
      } else {
        soberAlternatives[target.id] = pickSoberAlternative(
          otherNames[0] ?? "alguien"
        );
      }
    }

    // Warning for heavy penalties
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
      room,
      targets: targets.map((t) => t.id),
      mode,
      challenge,
      drinkAmounts,
      soberAlternatives,
      displayTexts,
    };
  }

  markDrank(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    player.stats.drinksTaken++;
    player.stats.challengesCompleted++;
    player.stats.penaltiesTaken++;
    player.drunkLevel = Math.min(10, player.drunkLevel + 0.5);
    player.isFino = isFino(player.drunkLevel);

    if (player.isFino) {
      this.addAlert(
        room,
        "fino",
        `🍻 ${player.name} ya va FINO (${player.drunkLevel}/10). ¡La sala entera lo celebra!`,
        player.id
      );
    }

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
      player.stats.drinksTaken++;
      player.drunkLevel = Math.min(10, player.drunkLevel + 0.5);
      player.isFino = isFino(player.drunkLevel);
    }

    return room;
  }

  disconnectPlayer(code: string, playerId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
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
    data: { name?: string; drunkLevel?: number; drinksAlcohol?: boolean }
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) return null;
    const host = room.players.find((p) => p.id === hostId);
    if (!host) return null;
    if (data.name) host.name = data.name;
    if (data.drunkLevel !== undefined) {
      host.drunkLevel = Math.min(10, Math.max(1, data.drunkLevel));
      host.isFino = isFino(host.drunkLevel);
    }
    if (data.drinksAlcohol !== undefined) host.drinksAlcohol = data.drinksAlcohol;
    return room;
  }

  private pickChallenge(room: RoomState): Challenge | null {
    if (!room.settings) return null;

    const all = getAllChallenges(room.customChallenges);
    const intensityMin = getIntensityMin(room.round);

    const filtered = all.filter((c) => {
      if (!room.settings!.challengeTypes.includes(c.type)) return false;
      if (!contentLevelAllowed(c.contentLevel, room.settings!.contentLevel))
        return false;
      if (c.type === "strip" && !room.settings!.stripEnabled) return false;
      if (c.intensity < intensityMin) return false;
      if (
        c.vibes.length > 0 &&
        !c.vibes.some((v) => room.settings!.vibes.includes(v))
      )
        return false;
      const orientations = room.settings!.orientations;
      if (
        c.orientations.length > 0 &&
        !c.orientations.some((o) => orientations.includes(o))
      )
        return false;
      return true;
    });

    const pool = filtered.length > 0 ? filtered : all.filter((c) => c.intensity >= intensityMin);
    if (pool.length === 0) return all[Math.floor(Math.random() * all.length)];

    return pool[Math.floor(Math.random() * pool.length)];
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

export interface SpinOutcome {
  room: RoomState;
  targets: string[];
  mode: GameMode;
  challenge: Challenge;
  drinkAmounts: Record<string, number>;
  soberAlternatives: Record<string, string>;
  displayTexts: Record<string, string>;
}
