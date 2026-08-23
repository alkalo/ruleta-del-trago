import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { RoomManager, type JoinErrorCode } from "./roomManager.js";
import type { GameSettings, Gender } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const rooms = new RoomManager();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

function emitRoom(code: string) {
  const room = rooms.getRoom(code);
  if (room) io.to(code).emit("room:update", room);
}

const JOIN_ERROR_MESSAGES: Record<JoinErrorCode, string> = {
  ROOM_EXPIRED: "La sala expiró. Crea otra.",
  GAME_IN_PROGRESS:
    "La partida ya empezó. Entra de nuevo con el mismo nombre.",
  ROOM_FULL: "La sala está llena.",
  NOT_HOST: "No se pudo recuperar el host de esta sala.",
};

function resolveRoomAssociation(
  socket: import("socket.io").Socket,
  currentCode: string | null,
  explicitCode?: string
): string | null {
  if (currentCode) return currentCode;
  if (!explicitCode) return null;

  const existing = rooms.getRoom(explicitCode);
  if (existing?.hostId === socket.id) {
    socket.join(existing.code);
    return existing.code;
  }

  const result = rooms.rejoinHost(explicitCode, socket.id);
  if (!result.ok) return null;

  socket.join(result.room.code);
  return result.room.code;
}

function playerMarkError(code: string | null, playerId: string): string {
  if (!code) return "No estás en la sala. Recarga la página para reconectar.";
  const room = rooms.getRoom(code);
  if (!room) return "Sala no encontrada. Recarga la página.";
  if (!room.activeSpin) return "No hay reto activo.";
  if (!room.activeSpin.targets.includes(playerId)) {
    return "Este reto no es para ti. Si acabas de reconectar, recarga.";
  }
  return "No se pudo marcar el reto.";
}

const distPath = path.join(__dirname, "../../dist");
app.use(express.static(distPath));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/socket.io") || req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) next();
  });
});

io.on("connection", (socket) => {
  let currentCode: string | null = null;

  socket.on("room:create", (callback) => {
    const room = rooms.createRoom(socket.id);
    currentCode = room.code;
    socket.join(room.code);
    callback({ ok: true, room });
  });

  socket.on(
    "room:join",
    (
      data: {
        code: string;
        name: string;
        drunkLevel: number;
        drinksAlcohol: boolean;
        gender?: Gender;
      },
      callback
    ) => {
      const result = rooms.joinRoom(
        data.code,
        socket.id,
        data.name,
        data.drunkLevel,
        data.drinksAlcohol,
        data.gender
      );
      if (!result.ok) {
        callback({
          ok: false,
          error: JOIN_ERROR_MESSAGES[result.errorCode],
          errorCode: result.errorCode,
        });
        return;
      }
      currentCode = result.room.code;
      socket.join(result.room.code);
      emitRoom(result.room.code);
      callback({ ok: true, room: result.room });
    }
  );

  socket.on(
    "room:rejoinHost",
    (data: { code: string; name?: string }, callback) => {
      const result = rooms.rejoinHost(data.code, socket.id, data.name);
      if (!result.ok) {
        callback({
          ok: false,
          error: JOIN_ERROR_MESSAGES[result.errorCode],
          errorCode: result.errorCode,
        });
        return;
      }
      currentCode = result.room.code;
      socket.join(result.room.code);
      emitRoom(result.room.code);
      callback({ ok: true, room: result.room });
    }
  );

  socket.on("room:lookup", (data: { code?: string }, callback) => {
    if (!data?.code) {
      callback({ ok: true, exists: false });
      return;
    }
    const room = rooms.getRoom(data.code);
    callback({ ok: true, exists: Boolean(room) });
  });

  socket.on(
    "host:settings",
    (payload: { code?: string; settings: GameSettings }, callback) => {
      const code = resolveRoomAssociation(socket, currentCode, payload.code);
      if (!code) {
        callback({
          ok: false,
          error: payload.code
            ? "Sala no encontrada. Vuelve a crear la partida."
            : "No estás en ninguna sala. Vuelve a crear la partida.",
        });
        return;
      }
      currentCode = code;

      const room = rooms.setHostSettings(code, socket.id, payload.settings);
      if (!room) {
        callback({
          ok: false,
          error: "No tienes permiso de host en esta sala.",
        });
        return;
      }
      emitRoom(code);
      callback({ ok: true, room });
    }
  );

  socket.on("host:updateName", (name: string) => {
    if (!currentCode) return;
    rooms.updateHostName(currentCode, socket.id, name);
    emitRoom(currentCode);
  });

  socket.on(
    "host:updateProfile",
    (data: {
      name?: string;
      drunkLevel?: number;
      drinksAlcohol?: boolean;
      gender?: Gender;
    }) => {
      if (!currentCode) return;
      rooms.updateHostProfile(currentCode, socket.id, data);
      emitRoom(currentCode);
    }
  );

  socket.on("host:start", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.startGame(currentCode, socket.id);
    if (!room) {
      callback({ ok: false, error: "No se puede iniciar" });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true, room });
  });

  socket.on(
    "host:spin",
    (
      payloadOrCb:
        | { code?: string }
        | ((res: { ok: boolean; room?: unknown; error?: string }) => void),
      maybeCb?: (res: { ok: boolean; room?: unknown; error?: string }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      if (!callback) return;
      const explicitCode =
        typeof payloadOrCb === "object" && payloadOrCb
          ? payloadOrCb.code
          : undefined;
      const code = resolveRoomAssociation(socket, currentCode, explicitCode);
      if (!code) {
        callback({
          ok: false,
          error: "No estás en la sala. Recarga la página para reconectar.",
        });
        return;
      }
      currentCode = code;
      const { room, error } = rooms.beginSpin(code, socket.id);
      if (!room) {
        callback({ ok: false, error: error ?? "No se pudo girar" });
        return;
      }
      emitRoom(code);
      callback({ ok: true, room });
    }
  );

  socket.on(
    "host:spinComplete",
    (
      payloadOrCb:
        | { code?: string }
        | ((res: {
            ok: boolean;
            spinResult?: unknown;
            error?: string;
          }) => void),
      maybeCb?: (res: {
        ok: boolean;
        spinResult?: unknown;
        error?: string;
      }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      if (!callback) return;
      const explicitCode =
        typeof payloadOrCb === "object" && payloadOrCb
          ? payloadOrCb.code
          : undefined;
      const associated = resolveRoomAssociation(
        socket,
        currentCode,
        explicitCode
      );
      if (!associated) {
        callback({
          ok: false,
          error: "No estás en la sala. Recarga la página para reconectar.",
        });
        return;
      }
      currentCode = associated;
      const result = rooms.completeSpin(currentCode, socket.id);
      if (!result.ok) {
        emitRoom(currentCode);
        callback({ ok: false, error: result.error });
        return;
      }
      const outcome = result.outcome;
      emitRoom(currentCode);
      callback({
        ok: true,
        spinResult: {
          targets: outcome.targets,
          mode: outcome.mode,
          challenge: outcome.challenge,
          drinkAmounts: outcome.drinkAmounts,
          skipDrinkAmounts: outcome.skipDrinkAmounts,
          soberAlternatives: outcome.soberAlternatives,
          displayTexts: outcome.displayTexts,
        },
      });
    }
  );

  socket.on("player:submitDrunkLevel", (data: { level: number }, callback) => {
    if (!currentCode) {
      callback({ ok: false, error: "Sin sala" });
      return;
    }
    const room = rooms.submitDrunkLevel(currentCode, socket.id, data.level);
    if (!room) {
      callback({ ok: false, error: "No se pudo confirmar" });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true, room });
  });

  socket.on("game:finishDrunkCheck", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.finishDrunkCheck(currentCode);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true, room });
  });

  socket.on("player:drank", (callback) => {
    if (!currentCode) {
      callback({ ok: false, error: playerMarkError(currentCode, socket.id) });
      return;
    }
    const room = rooms.playerMarkDrank(currentCode, socket.id);
    if (!room) {
      callback({ ok: false, error: playerMarkError(currentCode, socket.id) });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("player:completed", (callback) => {
    if (!currentCode) {
      callback({ ok: false, error: playerMarkError(currentCode, socket.id) });
      return;
    }
    const room = rooms.playerMarkCompleted(currentCode, socket.id);
    if (!room) {
      callback({ ok: false, error: playerMarkError(currentCode, socket.id) });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("player:skipped", (callback) => {
    if (!currentCode) {
      callback({ ok: false, error: playerMarkError(currentCode, socket.id) });
      return;
    }
    const room = rooms.playerMarkSkipped(currentCode, socket.id);
    if (!room) {
      callback({ ok: false, error: playerMarkError(currentCode, socket.id) });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("host:markDrank", (targetPlayerId: string, callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.hostMarkDrank(currentCode, socket.id, targetPlayerId);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("host:markCompleted", (targetPlayerId: string, callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.hostMarkCompleted(currentCode, socket.id, targetPlayerId);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("host:markSkipped", (targetPlayerId: string, callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.hostMarkSkipped(currentCode, socket.id, targetPlayerId);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("host:continue", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.continueAfterVictory(currentCode, socket.id);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true, room });
  });

  socket.on("disconnect", () => {
    if (currentCode) {
      rooms.disconnectPlayer(currentCode, socket.id);
      emitRoom(currentCode);
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Ruleta del Trago server on http://0.0.0.0:${PORT}`);
});
