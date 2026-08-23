import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import type { RoomState, GameSettings, Challenge, Gender, Player } from "@shared/types";
import { normalizeGender } from "@shared/types";

const SESSION_KEY = "ruleta-del-trago-session";
const CLIENT_KEY_STORAGE = "ruleta-del-trago-client-key";

let rejoinEpoch = 0;

export function clearPlayerSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function abandonPlayerSession(): void {
  rejoinEpoch += 1;
  rejoinInFlight = null;
  clearPlayerSession();
}

function getSocketUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const envUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;
    const envIsLocal = !!envUrl && /localhost|127\.0\.0\.1/i.test(envUrl);
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      if (envUrl && !envIsLocal) return envUrl;
      return window.location.origin;
    }
  }
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  return "http://localhost:3000";
}

export function getClientKey(): string {
  try {
    let key = sessionStorage.getItem(CLIENT_KEY_STORAGE);
    if (!key) {
      key =
        crypto.randomUUID?.() ??
        `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(CLIENT_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return `k-${Date.now()}`;
  }
}

function sessionPayload(extra: Record<string, unknown> = {}) {
  return {
    code: getSessionCode(),
    name: getSessionName(),
    clientKey: getClientKey(),
    ...extra,
  };
}

interface SessionData {
  code: string;
  name: string;
  drunkLevel: number;
  drinksAlcohol: boolean;
  gender?: Gender;
  isHost?: boolean;
}

function readSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

function getSessionCode(): string | null {
  return readSession()?.code ?? null;
}

function getSessionName(): string | undefined {
  const name = readSession()?.name?.trim();
  return name || undefined;
}

const ACK_TIMEOUT_MSG =
  "El servidor no responde. Revisa la conexión e inténtalo de nuevo.";

function playAck(
  socket: Socket,
  event: string,
  payload?: unknown,
  timeoutMs = 8000
): Promise<AckRes> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(ACK_TIMEOUT_MSG));
    }, timeoutMs);
    const ack = (res: AckRes) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(res ?? { ok: false });
    };
    if (payload !== undefined) socket.emit(event, payload, ack);
    else socket.emit(event, ack);
  });
}

function saveSession(data: SessionData): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function savePlayerSession(data: SessionData): void {
  saveSession({
    code: data.code.trim().toUpperCase(),
    name: data.name,
    drunkLevel: data.drunkLevel,
    drinksAlcohol: data.drinksAlcohol,
    gender: normalizeGender(data.gender),
    isHost: data.isHost,
  });
}

export class RoomRejoinError extends Error {
  readonly kind: "expired" | "failed";
  constructor(kind: "expired" | "failed", message: string) {
    super(message);
    this.name = "RoomRejoinError";
    this.kind = kind;
  }
}

function pathRoomCode(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/(lobby|game)\/([^/]+)/i);
  return match?.[2]?.toUpperCase() ?? null;
}

function setupQueryCode(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.location.pathname.startsWith("/host/setup")) return null;
  const code = new URLSearchParams(window.location.search).get("code");
  return code?.trim().toUpperCase() || null;
}

type AckRes = {
  ok: boolean;
  room?: RoomState;
  error?: string;
  errorCode?: string;
  exists?: boolean;
  spinResult?: {
    targets: string[];
    mode: string;
    challenge: Challenge;
    drinkAmounts: Record<string, number>;
    skipDrinkAmounts?: Record<string, number>;
    soberAlternatives: Record<string, string>;
    displayTexts: Record<string, string>;
  };
};

function ackEmit(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 15000
): Promise<AckRes> {
  return new Promise((resolve, reject) => {
    socket
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, res: AckRes) => {
        if (err) {
          reject(
            new RoomRejoinError(
              "failed",
              "El servidor no responde. Reinténtalo."
            )
          );
          return;
        }
        resolve(res ?? { ok: false });
      });
  });
}

function waitConnected(socket: Socket, timeoutMs = 15000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      socket.off("connect", onConnect);
      reject(
        new RoomRejoinError("failed", "Sin conexión. Reinténtalo en unos segundos.")
      );
    }, timeoutMs);
    const onConnect = () => {
      window.clearTimeout(timer);
      resolve();
    };
    socket.once("connect", onConnect);
  });
}

let rejoinInFlight: { key: string; promise: Promise<RoomState> } | null = null;

async function performRejoin(
  socket: Socket,
  code: string,
  setRoom: (room: RoomState) => void
): Promise<RoomState> {
  const normalized = code.trim().toUpperCase();
  const epoch = rejoinEpoch;
  if (rejoinInFlight?.key === normalized) {
    return rejoinInFlight.promise;
  }

  const run = async (): Promise<RoomState> => {
    await waitConnected(socket);
    if (epoch !== rejoinEpoch) {
      throw new RoomRejoinError("failed", "Sesión descartada.");
    }
    const session = readSession();
    const gender = normalizeGender(session?.gender);
    const name = session?.name?.trim() ?? "";
    const drunkLevel = session?.drunkLevel ?? 5;
    const drinksAlcohol = session?.drinksAlcohol ?? true;
    const sessionCode = session?.code?.trim().toUpperCase() ?? "";
    const sameRoom = sessionCode === normalized;
    const tryAsHost = sameRoom && session?.isHost === true;

    if (tryAsHost) {
      const hostRes = await ackEmit(socket, "room:rejoinHost", {
        code: normalized,
        name,
        clientKey: getClientKey(),
      });
      if (hostRes.ok && hostRes.room) {
        savePlayerSession({
          code: hostRes.room.code,
          name: name || session?.name || "Host",
          drunkLevel,
          drinksAlcohol,
          gender,
          isHost: true,
        });
        setRoom(hostRes.room);
        return hostRes.room;
      }
      if (hostRes.errorCode === "ROOM_EXPIRED") {
        clearPlayerSession();
        throw new RoomRejoinError("expired", "La sala expiró. Crea otra.");
      }
    }

    if (!name) {
      const lookup = await ackEmit(socket, "room:lookup", {
        code: normalized,
      });
      if (!lookup.exists) {
        clearPlayerSession();
        throw new RoomRejoinError("expired", "La sala expiró. Crea otra.");
      }
      throw new RoomRejoinError(
        "failed",
        "No hay sesión. Entra de nuevo con el mismo nombre."
      );
    }

    const joinRes = await ackEmit(socket, "room:join", {
      code: normalized,
      name,
      drunkLevel,
      drinksAlcohol,
      gender,
      clientKey: getClientKey(),
    });
    if (joinRes.ok && joinRes.room) {
      savePlayerSession({
        code: joinRes.room.code,
        name,
        drunkLevel,
        drinksAlcohol,
        gender,
        isHost: joinRes.room.hostId === socket.id,
      });
      setRoom(joinRes.room);
      return joinRes.room;
    }
    if (joinRes.errorCode === "ROOM_EXPIRED") {
      clearPlayerSession();
      throw new RoomRejoinError("expired", "La sala expiró. Crea otra.");
    }
    throw new RoomRejoinError(
      "failed",
      joinRes.error ??
        "No se pudo reconectar. Entra de nuevo con el mismo nombre."
    );
  };

  const promise = run().finally(() => {
    if (rejoinInFlight?.key === normalized) rejoinInFlight = null;
  });
  rejoinInFlight = { key: normalized, promise };
  return promise;
}

export interface SpinResultPayload {
  targets: string[];
  mode: string;
  challenge: Challenge;
  drinkAmounts: Record<string, number>;
  skipDrinkAmounts?: Record<string, number>;
  soberAlternatives: Record<string, string>;
  displayTexts: Record<string, string>;
}

interface SocketContextValue {
  socket: Socket | null;
  room: RoomState | null;
  connected: boolean;
  playerId: string;
  isHost: boolean;
  lastSpinResult: SpinResultPayload | null;
  createRoom: () => Promise<RoomState>;
  joinRoom: (
    code: string,
    name: string,
    drunkLevel: number,
    drinksAlcohol: boolean,
    gender: Gender
  ) => Promise<RoomState>;
  setSettings: (settings: GameSettings, code?: string) => Promise<RoomState>;
  updateHostName: (name: string) => void;
  updateHostProfile: (data: {
    name?: string;
    drunkLevel?: number;
    drinksAlcohol?: boolean;
    gender?: Gender;
  }) => void;
  startGame: () => Promise<RoomState>;
  beginSpin: () => Promise<RoomState>;
  completeSpin: () => Promise<SpinResultPayload>;
  submitDrunkLevel: (level: number) => Promise<RoomState>;
  markDrank: () => Promise<void>;
  markCompleted: () => Promise<void>;
  markSkipped: () => Promise<void>;
  continueGame: () => Promise<RoomState>;
  rejoinByCode: (code: string) => Promise<RoomState>;
  discardSession: () => void;
  clientKey: string;
  hostMarkDrank: (targetId: string) => Promise<void>;
  hostMarkCompleted: (targetId: string) => Promise<void>;
  hostMarkSkipped: (targetId: string) => Promise<void>;
}

function resolveSelf(
  room: RoomState | null,
  socketId: string
): Player | undefined {
  if (!room) return undefined;
  const byId = room.players.find((p) => p.id === socketId);
  if (byId) return byId;
  const key = getClientKey();
  if (key) {
    const byKey = room.players.find((p) => p.clientKey === key);
    if (byKey) return byKey;
  }
  const session = readSession();
  if (session?.name) {
    const n = session.name.trim().toLowerCase();
    const matches = room.players.filter(
      (p) => p.name.toLowerCase() === n
    );
    if (matches.length === 1) {
      const m = matches[0];
      if (key && m.clientKey && m.clientKey !== key) return undefined;
      return m;
    }
  }
  return undefined;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSpinResult, setLastSpinResult] = useState<SpinResultPayload | null>(
    null
  );

  useEffect(() => {
    const s = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });
    setSocket(s);
    s.on("room:update", (r: RoomState) => {
      const sessionCode = readSession()?.code?.trim().toUpperCase();
      if (sessionCode && r.code.trim().toUpperCase() !== sessionCode) return;
      setRoom(r);
      if (r.activeSpin) setLastSpinResult(r.activeSpin);
    });

    const tryRejoin = () => {
      const code = pathRoomCode() || setupQueryCode();
      if (!code) return;
      void performRejoin(s, code, setRoom).catch(() => {
        /* Game/Lobby/setup muestran el error */
      });
    };

    s.on("connect", () => {
      setConnected(true);
      tryRejoin();
    });
    s.on("disconnect", () => setConnected(false));
    return () => {
      s.disconnect();
    };
  }, []);

  const discardSession = useCallback(() => {
    abandonPlayerSession();
    setRoom(null);
    setLastSpinResult(null);
    if (socket) socket.emit("room:leave");
  }, [socket]);

  const createRoom = useCallback(async () => {
    if (!socket) throw new Error("Sin conexión al servidor");
    abandonPlayerSession();
    setRoom(null);
    setLastSpinResult(null);
    try {
      await playAck(socket, "room:leave");
    } catch {
      /* la sala vieja puede no existir */
    }
    const res = await playAck(socket, "room:create", {
      clientKey: getClientKey(),
    });
    if (res.ok && res.room) {
      setLastSpinResult(null);
      savePlayerSession({
        code: res.room.code,
        name: "Host",
        drunkLevel: 5,
        drinksAlcohol: true,
        gender: "otro",
        isHost: true,
      });
      setRoom(res.room);
      return res.room;
    }
    throw new Error("Error al crear sala");
  }, [socket]);

  const joinRoom = useCallback(
    async (
      code: string,
      name: string,
      drunkLevel: number,
      drinksAlcohol: boolean,
      gender: Gender
    ) => {
      if (!socket) throw new Error("Sin conexión al servidor");
      const previous = readSession()?.code?.trim().toUpperCase();
      if (previous && previous !== code.trim().toUpperCase()) {
        abandonPlayerSession();
      }
      const res = await playAck(socket, "room:join", {
        code,
        name,
        drunkLevel,
        drinksAlcohol,
        gender,
        clientKey: getClientKey(),
      });
      if (res.ok && res.room) {
        savePlayerSession({
          code: res.room.code,
          name,
          drunkLevel,
          drinksAlcohol,
          gender: normalizeGender(gender),
          isHost: res.room.hostId === socket.id,
        });
        setRoom(res.room);
        return res.room;
      }
      throw new Error(res.error ?? "Error al unirse");
    },
    [socket]
  );

  const setSettings = useCallback(
    async (settings: GameSettings, explicitCode?: string) => {
      if (!socket) throw new Error("Sin conexión al servidor");
      const roomCode = explicitCode ?? room?.code ?? getSessionCode();
      if (!roomCode) {
        throw new Error("No hay código de sala. Vuelve a crear la partida.");
      }
      const res = await playAck(socket, "host:settings", {
        code: roomCode,
        settings,
        clientKey: getClientKey(),
      });
      if (res.ok && res.room) {
        setRoom(res.room);
        return res.room;
      }
      throw new Error(res.error ?? "Error al guardar configuración");
    },
    [socket, room]
  );

  const updateHostName = useCallback(
    (name: string) => {
      if (socket) socket.emit("host:updateName", name);
    },
    [socket]
  );

  const updateHostProfile = useCallback(
    (data: {
      name?: string;
      drunkLevel?: number;
      drinksAlcohol?: boolean;
      gender?: Gender;
    }) => {
      if (socket) {
        socket.emit("host:updateProfile", {
          ...data,
          code: getSessionCode() ?? undefined,
          clientKey: getClientKey(),
        });
      }
      const session = readSession();
      const code = session?.code ?? getSessionCode();
      if (code) {
        savePlayerSession({
          code,
          name: data.name || session?.name || "Host",
          drunkLevel:
            data.drunkLevel !== undefined
              ? data.drunkLevel
              : (session?.drunkLevel ?? 5),
          drinksAlcohol:
            data.drinksAlcohol !== undefined
              ? data.drinksAlcohol
              : (session?.drinksAlcohol ?? true),
          gender: normalizeGender(data.gender ?? session?.gender),
          isHost: session?.isHost ?? true,
        });
      }
    },
    [socket]
  );

  const startGame = useCallback(async () => {
    if (!socket) throw new Error("Sin conexión al servidor");
    const res = await playAck(socket, "host:start", sessionPayload());
    if (res.ok && res.room) {
      setRoom(res.room);
      return res.room;
    }
    throw new Error(res.error ?? "Error al iniciar");
  }, [socket]);

  const beginSpin = useCallback(async () => {
    if (!socket) throw new Error("Sin conexión al servidor");
    const res = await playAck(socket, "host:spin", sessionPayload());
    if (res.ok && res.room) {
      setLastSpinResult(null);
      setRoom(res.room);
      return res.room;
    }
    throw new Error(res.error ?? "No se pudo girar");
  }, [socket]);

  const completeSpin = useCallback(async () => {
    if (!socket) throw new Error("Sin conexión al servidor");
    const res = await playAck(socket, "host:spinComplete", sessionPayload());
    if (res.room) setRoom(res.room);
    if (res.ok && res.spinResult) {
      setLastSpinResult(res.spinResult);
      return res.spinResult;
    }
    throw new Error(res.error ?? "Error al completar giro");
  }, [socket]);

  const submitDrunkLevel = useCallback(
    async (level: number) => {
      if (!socket) throw new Error("Sin conexión al servidor");
      const res = await playAck(socket, "player:submitDrunkLevel", {
        ...sessionPayload(),
        level,
      });
      if (res.ok && res.room) {
        setRoom(res.room);
        return res.room;
      }
      throw new Error(res.error ?? "No se pudo confirmar nivel");
    },
    [socket]
  );

  const markAction = useCallback(
    async (event: "player:drank" | "player:completed" | "player:skipped") => {
      if (!socket) throw new Error("Sin conexión al servidor");
      const res = await playAck(socket, event, sessionPayload());
      if (res.ok) return;
      throw new Error(res.error ?? "Error");
    },
    [socket]
  );

  const markDrank = useCallback(() => markAction("player:drank"), [markAction]);
  const markCompleted = useCallback(
    () => markAction("player:completed"),
    [markAction]
  );
  const markSkipped = useCallback(
    () => markAction("player:skipped"),
    [markAction]
  );

  const continueGame = useCallback(async () => {
    if (!socket) throw new Error("Sin conexión al servidor");
    const res = await playAck(socket, "host:continue", sessionPayload());
    if (res.ok && res.room) {
      setLastSpinResult(null);
      setRoom(res.room);
      return res.room;
    }
    throw new Error(res.error ?? "Error al continuar");
  }, [socket]);

  const hostMarkAction = useCallback(
    async (
      event: "host:markDrank" | "host:markCompleted" | "host:markSkipped",
      targetId: string
    ) => {
      if (!socket) throw new Error("Sin conexión al servidor");
      const res = await playAck(socket, event, {
        ...sessionPayload(),
        targetPlayerId: targetId,
      });
      if (res.ok) return;
      throw new Error(res.error ?? "No se pudo marcar el reto");
    },
    [socket]
  );

  const hostMarkDrank = useCallback(
    (targetId: string) => hostMarkAction("host:markDrank", targetId),
    [hostMarkAction]
  );
  const hostMarkCompleted = useCallback(
    (targetId: string) => hostMarkAction("host:markCompleted", targetId),
    [hostMarkAction]
  );
  const hostMarkSkipped = useCallback(
    (targetId: string) => hostMarkAction("host:markSkipped", targetId),
    [hostMarkAction]
  );

  const rejoinByCode = useCallback(
    (code: string) => {
      if (!socket) {
        return Promise.reject(
          new RoomRejoinError("failed", "Sin conexión al servidor")
        );
      }
      return performRejoin(socket, code, setRoom);
    },
    [socket]
  );

  const selfPlayer = resolveSelf(room, socket?.id ?? "");
  const playerId = selfPlayer?.id ?? socket?.id ?? "";
  const isHost = Boolean(selfPlayer?.isHost || (room && room.hostId === playerId));
  const clientKey = getClientKey();

  return (
    <SocketContext.Provider
      value={{
        socket,
        room,
        connected,
        playerId,
        isHost,
        lastSpinResult,
        createRoom,
        joinRoom,
        setSettings,
        updateHostName,
        updateHostProfile,
        startGame,
        beginSpin,
        completeSpin,
        submitDrunkLevel,
        markDrank,
        markCompleted,
        markSkipped,
        continueGame,
        rejoinByCode,
        discardSession,
        clientKey,
        hostMarkDrank,
        hostMarkCompleted,
        hostMarkSkipped,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
