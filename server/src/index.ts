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
  SETUP_IN_PROGRESS: "El host aún está configurando. Espera un momento.",
  ROOM_FULL: "La sala está llena.",
  NOT_HOST: "No se pudo recuperar el host de esta sala.",
  NAME_TAKEN: "Ese nombre ya está en la sala. Elige otro.",
};

function safeAck(callback: unknown, payload: unknown): void {
  if (typeof callback === "function") {
    (callback as (p: unknown) => void)(payload);
  }
}

function bindSocketToRoom(
  socket: import("socket.io").Socket,
  previous: string | null,
  next: string
): string {
  if (previous && previous !== next) socket.leave(previous);
  socket.join(next);
  return next;
}

function resolveRoomAssociation(
  socket: import("socket.io").Socket,
  currentCode: string | null,
  explicitCode?: string,
  identity?: { name?: string; clientKey?: string }
): string | null {
  const candidates = [currentCode, explicitCode]
    .filter((c): c is string => Boolean(c && c.trim()))
    .map((c) => c.trim().toUpperCase());
  const unique = [...new Set(candidates)];

  for (const code of unique) {
    const room = rooms.getRoom(code);
    if (!room) continue;

    if (room.players.some((p) => p.id === socket.id)) {
      return bindSocketToRoom(socket, currentCode, room.code);
    }

    const attached = rooms.attachSocket(code, socket.id, identity);
    if (attached) {
      return bindSocketToRoom(socket, currentCode, attached.code);
    }

    const host = rooms.rejoinHost(
      code,
      socket.id,
      identity?.name,
      identity?.clientKey
    );
    if (host.ok) {
      return bindSocketToRoom(socket, currentCode, host.room.code);
    }
  }

  return null;
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
const indexHtml = path.join(distPath, "index.html");
app.use(express.static(distPath));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// F5 en /game/XXX o /lobby/XXX debe devolver la SPA, no 404.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/socket.io") || req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(indexHtml, (err) => {
    if (err) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode) || 404
          : 404;
      res.status(status).end();
    }
  });
});

io.on("connection", (socket) => {
  let currentCode: string | null = null;

  socket.on(
    "room:create",
    (
      payloadOrCb:
        | { clientKey?: string }
        | ((res: { ok: boolean; room?: unknown }) => void),
      maybeCb?: (res: { ok: boolean; room?: unknown }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      const payload =
        typeof payloadOrCb === "object" && payloadOrCb ? payloadOrCb : {};
      if (currentCode) {
        socket.leave(currentCode);
        rooms.disconnectPlayer(currentCode, socket.id);
        emitRoom(currentCode);
      }
      const room = rooms.createRoom(socket.id, payload.clientKey);
      currentCode = room.code;
      socket.join(room.code);
      safeAck(callback, { ok: true, room });
    }
  );

  socket.on("room:leave", (callback) => {
    if (currentCode) {
      socket.leave(currentCode);
      rooms.disconnectPlayer(currentCode, socket.id);
      emitRoom(currentCode);
      currentCode = null;
    }
    safeAck(callback, { ok: true });
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
        clientKey?: string;
      },
      callback
    ) => {
      const requested = data.code?.trim().toUpperCase();
      if (currentCode && requested && currentCode !== requested) {
        const current = rooms.getRoom(currentCode);
        if (current?.hostId === socket.id) {
          safeAck(callback, {
            ok: false,
            error: "Ya estás en una sala nueva.",
            errorCode: "NOT_HOST",
          });
          return;
        }
        socket.leave(currentCode);
        rooms.disconnectPlayer(currentCode, socket.id);
        emitRoom(currentCode);
        currentCode = null;
      }
      const result = rooms.joinRoom(
        data.code,
        socket.id,
        data.name,
        data.drunkLevel,
        data.drinksAlcohol,
        data.gender,
        data.clientKey
      );
      if (!result.ok) {
        safeAck(callback, {
          ok: false,
          error: JOIN_ERROR_MESSAGES[result.errorCode],
          errorCode: result.errorCode,
        });
        return;
      }
      currentCode = bindSocketToRoom(socket, currentCode, result.room.code);
      emitRoom(result.room.code);
      safeAck(callback, { ok: true, room: result.room });
    }
  );

  socket.on(
    "room:rejoinHost",
    (data: { code: string; name?: string; clientKey?: string }, callback) => {
      const result = rooms.rejoinHost(
        data.code,
        socket.id,
        data.name,
        data.clientKey
      );
      if (!result.ok) {
        safeAck(callback, {
          ok: false,
          error: JOIN_ERROR_MESSAGES[result.errorCode],
          errorCode: result.errorCode,
        });
        return;
      }
      currentCode = bindSocketToRoom(socket, currentCode, result.room.code);
      emitRoom(result.room.code);
      safeAck(callback, { ok: true, room: result.room });
    }
  );

  socket.on("room:lookup", (data: { code?: string }, callback) => {
    if (!data?.code) {
      safeAck(callback, { ok: true, exists: false });
      return;
    }
    const room = rooms.getRoom(data.code);
    safeAck(callback, { ok: true, exists: Boolean(room) });
  });

  socket.on(
    "host:settings",
    (payload: { code?: string; settings: GameSettings }, callback) => {
      const code = resolveRoomAssociation(socket, currentCode, payload.code, {
        clientKey: (payload as { clientKey?: string }).clientKey,
      });
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
      safeAck(callback, { ok: true, room });
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
      code?: string;
    }) => {
      const code = resolveRoomAssociation(socket, currentCode, data.code, {
        name: data.name,
        clientKey: (data as { clientKey?: string }).clientKey,
      });
      if (!code) return;
      currentCode = code;
      rooms.updateHostProfile(code, socket.id, data);
      emitRoom(code);
    }
  );

  socket.on(
    "host:start",
    (
      payloadOrCb:
        | { code?: string; name?: string; clientKey?: string }
        | ((res: { ok: boolean; room?: unknown; error?: string }) => void),
      maybeCb?: (res: { ok: boolean; room?: unknown; error?: string }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      const explicit =
        typeof payloadOrCb === "object" && payloadOrCb ? payloadOrCb : undefined;
      const code = resolveRoomAssociation(
        socket,
        currentCode,
        explicit?.code,
        explicit
      );
      if (!code) {
        safeAck(callback, {
          ok: false,
          error: "No estás en la sala. Recarga la página para reconectar.",
        });
        return;
      }
      currentCode = code;
      const started = rooms.startGame(code, socket.id);
      if (!started.room) {
        safeAck(callback, {
          ok: false,
          error: started.error ?? "No se puede iniciar",
        });
        return;
      }
      emitRoom(code);
      safeAck(callback, { ok: true, room: started.room });
    }
  );

  socket.on(
    "host:spin",
    (
      payloadOrCb:
        | { code?: string; name?: string; clientKey?: string }
        | ((res: { ok: boolean; room?: unknown; error?: string }) => void),
      maybeCb?: (res: { ok: boolean; room?: unknown; error?: string }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      if (!callback) return;
      const explicit =
        typeof payloadOrCb === "object" && payloadOrCb ? payloadOrCb : undefined;
      const code = resolveRoomAssociation(
        socket,
        currentCode,
        explicit?.code,
        explicit
      );
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
      safeAck(callback, { ok: true, room });
    }
  );

  socket.on(
    "host:spinComplete",
    (
      payloadOrCb:
        | { code?: string; name?: string; clientKey?: string }
        | ((res: {
            ok: boolean;
            room?: unknown;
            spinResult?: unknown;
            error?: string;
          }) => void),
      maybeCb?: (res: {
        ok: boolean;
        room?: unknown;
        spinResult?: unknown;
        error?: string;
      }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      if (!callback) return;
      const explicit =
        typeof payloadOrCb === "object" && payloadOrCb ? payloadOrCb : undefined;
      const associated = resolveRoomAssociation(
        socket,
        currentCode,
        explicit?.code,
        explicit
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
        callback({ ok: false, error: result.error, room: result.room });
        return;
      }
      const outcome = result.outcome;
      emitRoom(currentCode);
      callback({
        ok: true,
        room: outcome.room,
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

  socket.on(
    "player:submitDrunkLevel",
    (
      data: { level: number; code?: string; clientKey?: string; name?: string },
      callback?: (res: { ok: boolean; room?: unknown; error?: string }) => void
    ) => {
      const code = resolveRoomAssociation(socket, currentCode, data?.code, {
        name: data?.name,
        clientKey: data?.clientKey,
      });
      if (!code) {
        safeAck(callback, { ok: false, error: "Sin sala" });
        return;
      }
      currentCode = code;
      const room = rooms.submitDrunkLevel(code, socket.id, data.level, {
        name: data?.name,
        clientKey: data?.clientKey,
      });
      if (!room) {
        safeAck(callback, { ok: false, error: "No se pudo confirmar" });
        return;
      }
      emitRoom(code);
      safeAck(callback, { ok: true, room });
    }
  );

  socket.on("game:finishDrunkCheck", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const current = rooms.getRoom(currentCode);
    if (!current || current.hostId !== socket.id) {
      safeAck(callback, { ok: false, error: "Solo el host puede saltar la pausa." });
      return;
    }
    const room = rooms.finishDrunkCheck(currentCode);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    safeAck(callback, { ok: true, room });
  });

  function handlePlayerMark(
    event: "player:drank" | "player:completed" | "player:skipped",
    mark: (
      code: string,
      playerId: string,
      identity?: { name?: string; clientKey?: string }
    ) => ReturnType<typeof rooms.playerMarkDrank>
  ) {
    socket.on(
      event,
      (
        payloadOrCb:
          | { code?: string; clientKey?: string; name?: string }
          | ((res: { ok: boolean; error?: string }) => void),
        maybeCb?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const callback =
          typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
        const explicit =
          typeof payloadOrCb === "object" && payloadOrCb
            ? payloadOrCb
            : undefined;
        const code = resolveRoomAssociation(
          socket,
          currentCode,
          explicit?.code,
          explicit
        );
        if (!code) {
          safeAck(callback, {
            ok: false,
            error: playerMarkError(null, socket.id),
          });
          return;
        }
        currentCode = code;
        const room = mark(code, socket.id, {
          name: explicit?.name,
          clientKey: explicit?.clientKey,
        });
        if (!room) {
          safeAck(callback, {
            ok: false,
            error: playerMarkError(code, socket.id),
          });
          return;
        }
        emitRoom(code);
        safeAck(callback, { ok: true });
      }
    );
  }

  handlePlayerMark("player:drank", (code, id, identity) =>
    rooms.playerMarkDrank(code, id, identity)
  );
  handlePlayerMark("player:completed", (code, id, identity) =>
    rooms.playerMarkCompleted(code, id, identity)
  );
  handlePlayerMark("player:skipped", (code, id, identity) =>
    rooms.playerMarkSkipped(code, id, identity)
  );

  function handleHostMark(
    event: "host:markDrank" | "host:markCompleted" | "host:markSkipped",
    mark: (
      code: string,
      hostId: string,
      targetId: string
    ) => ReturnType<typeof rooms.hostMarkDrank>
  ) {
    socket.on(
      event,
      (
        payloadOrTarget:
          | string
          | { targetPlayerId?: string; code?: string; clientKey?: string },
        maybeCb?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const targetId =
          typeof payloadOrTarget === "string"
            ? payloadOrTarget
            : payloadOrTarget?.targetPlayerId;
        const explicit =
          typeof payloadOrTarget === "object" && payloadOrTarget
            ? payloadOrTarget
            : undefined;
        const code = resolveRoomAssociation(
          socket,
          currentCode,
          explicit?.code,
          explicit
        );
        if (!code || !targetId) {
          safeAck(maybeCb, { ok: false, error: "No se pudo marcar el reto." });
          return;
        }
        currentCode = code;
        const room = mark(code, socket.id, targetId);
        if (!room) {
          safeAck(maybeCb, { ok: false, error: "No se pudo marcar el reto." });
          return;
        }
        emitRoom(code);
        safeAck(maybeCb, { ok: true });
      }
    );
  }

  handleHostMark("host:markDrank", (code, hostId, target) =>
    rooms.hostMarkDrank(code, hostId, target)
  );
  handleHostMark("host:markCompleted", (code, hostId, target) =>
    rooms.hostMarkCompleted(code, hostId, target)
  );
  handleHostMark("host:markSkipped", (code, hostId, target) =>
    rooms.hostMarkSkipped(code, hostId, target)
  );

  socket.on(
    "host:continue",
    (
      payloadOrCb:
        | { code?: string; name?: string; clientKey?: string }
        | ((res: { ok: boolean; room?: unknown; error?: string }) => void),
      maybeCb?: (res: { ok: boolean; room?: unknown; error?: string }) => void
    ) => {
      const callback =
        typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      const explicit =
        typeof payloadOrCb === "object" && payloadOrCb ? payloadOrCb : undefined;
      const code = resolveRoomAssociation(
        socket,
        currentCode,
        explicit?.code,
        explicit
      );
      if (!code) {
        safeAck(callback, { ok: false, error: "No se pudo continuar" });
        return;
      }
      currentCode = code;
      const room = rooms.continueAfterVictory(code, socket.id);
      if (!room) {
        safeAck(callback, { ok: false, error: "No se pudo continuar" });
        return;
      }
      emitRoom(code);
      safeAck(callback, { ok: true, room });
    }
  );

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
