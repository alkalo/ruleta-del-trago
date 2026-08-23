import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { RoomManager } from "./roomManager.js";
import type { GameSettings, Challenge } from "../../shared/types.js";

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

// Serve static in production
const distPath = path.join(__dirname, "../../dist");
app.use(express.static(distPath));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/socket.io") ||
    req.path.startsWith("/api")
  ) {
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
      },
      callback
    ) => {
      const room = rooms.joinRoom(
        data.code,
        socket.id,
        data.name,
        data.drunkLevel,
        data.drinksAlcohol
      );
      if (!room) {
        callback({ ok: false, error: "No se puede unir a la sala" });
        return;
      }
      currentCode = room.code;
      socket.join(room.code);
      emitRoom(room.code);
      callback({ ok: true, room });
    }
  );

  socket.on(
    "host:settings",
    (settings: GameSettings, callback) => {
      if (!currentCode) {
        callback({ ok: false });
        return;
      }
      const room = rooms.setHostSettings(currentCode, settings);
      if (!room) {
        callback({ ok: false });
        return;
      }
      emitRoom(currentCode);
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
    (data: { name?: string; drunkLevel?: number; drinksAlcohol?: boolean }) => {
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

  socket.on("host:spin", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const room = rooms.beginSpin(currentCode, socket.id);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true, room });
  });

  socket.on("host:spinComplete", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    const outcome = rooms.completeSpin(currentCode, socket.id);
    if (!outcome) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({
      ok: true,
      spinResult: {
        targets: outcome.targets,
        mode: outcome.mode,
        challenge: outcome.challenge,
        drinkAmounts: outcome.drinkAmounts,
        soberAlternatives: outcome.soberAlternatives,
        displayTexts: outcome.displayTexts,
      },
    });
  });

  socket.on(
    "game:drunkLevels",
    (updates: Record<string, number>, callback) => {
      if (!currentCode) {
        callback({ ok: false });
        return;
      }
      const room = rooms.updateDrunkLevels(currentCode, updates);
      if (!room) {
        callback({ ok: false });
        return;
      }
      emitRoom(currentCode);
      callback({ ok: true, room });
    }
  );

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
      callback({ ok: false });
      return;
    }
    const room = rooms.markDrank(currentCode, socket.id);
    if (!room) {
      callback({ ok: false });
      return;
    }
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("player:completed", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    rooms.markCompleted(currentCode, socket.id);
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on("player:skipped", (callback) => {
    if (!currentCode) {
      callback({ ok: false });
      return;
    }
    rooms.markSkipped(currentCode, socket.id);
    emitRoom(currentCode);
    callback({ ok: true });
  });

  socket.on(
    "host:addChallenge",
    (challenge: Omit<Challenge, "id">, callback) => {
      if (!currentCode) {
        callback({ ok: false });
        return;
      }
      const room = rooms.addCustomChallenge(
        currentCode,
        socket.id,
        challenge
      );
      if (!room) {
        callback({ ok: false });
        return;
      }
      emitRoom(currentCode);
      callback({ ok: true, room });
    }
  );

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
