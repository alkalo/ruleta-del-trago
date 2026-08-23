import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import type { RoomState, GameSettings, Challenge, Gender } from "@shared/types";
import { normalizeGender } from "@shared/types";

const SESSION_KEY = "ruleta-del-trago-session";

function getSocketUrl(): string {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (typeof window === "undefined") return "";
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://localhost:3000";
  }
  return window.location.origin;
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
};

function ackEmit(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 8000
): Promise<AckRes> {
  return new Promise((resolve, reject) => {
    socket
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, res: AckRes) => {
        if (err) {
          reject(new RoomRejoinError("expired", "La sala expiró. Crea otra."));
          return;
        }
        resolve(res ?? { ok: false });
      });
  });
}

function waitConnected(socket: Socket, timeoutMs = 8000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      socket.off("connect", onConnect);
      reject(new RoomRejoinError("expired", "La sala expiró. Crea otra."));
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
  if (rejoinInFlight?.key === normalized) {
    return rejoinInFlight.promise;
  }

  const run = async (): Promise<RoomState> => {
    await waitConnected(socket);
    const session = readSession();
    const gender = normalizeGender(session?.gender);
    const name = session?.name?.trim() ?? "";
    const drunkLevel = session?.drunkLevel ?? 5;
    const drinksAlcohol = session?.drinksAlcohol ?? true;
    const sessionCode = session?.code?.trim().toUpperCase() ?? "";
    const sameRoom = sessionCode === normalized;
    const tryAsHost = sameRoom && session?.isHost !== false;

    if (tryAsHost) {
      const hostRes = await ackEmit(socket, "room:rejoinHost", {
        code: normalized,
        name,
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
        throw new RoomRejoinError("expired", "La sala expiró. Crea otra.");
      }
    }

    if (!name) {
      const lookup = await ackEmit(socket, "room:lookup", {
        code: normalized,
      });
      if (!lookup.exists) {
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

  const createRoom = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("room:create", (res: { ok: boolean; room?: RoomState }) => {
        if (res.ok && res.room) {
          savePlayerSession({
            code: res.room.code,
            name: "Host",
            drunkLevel: 5,
            drinksAlcohol: true,
            gender: "otro",
            isHost: true,
          });
          setRoom(res.room);
          resolve(res.room);
        } else reject(new Error("Error al crear sala"));
      });
    });
  }, [socket]);

  const joinRoom = useCallback(
    (
      code: string,
      name: string,
      drunkLevel: number,
      drinksAlcohol: boolean,
      gender: Gender
    ) => {
      if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit(
          "room:join",
          { code, name, drunkLevel, drinksAlcohol, gender },
          (res: { ok: boolean; room?: RoomState; error?: string }) => {
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
              resolve(res.room);
            } else reject(new Error(res.error ?? "Error al unirse"));
          }
        );
      });
    },
    [socket]
  );

  const setSettings = useCallback(
    (settings: GameSettings, explicitCode?: string) => {
      if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
      const roomCode = explicitCode ?? room?.code ?? getSessionCode();
      if (!roomCode) {
        return Promise.reject(
          new Error("No hay código de sala. Vuelve a crear la partida.")
        );
      }
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit(
          "host:settings",
          { code: roomCode, settings },
          (res: { ok: boolean; room?: RoomState; error?: string }) => {
            if (res.ok && res.room) {
              setRoom(res.room);
              resolve(res.room);
            } else {
              reject(
                new Error(res.error ?? "Error al guardar configuración")
              );
            }
          }
        );
      });
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
      if (socket) socket.emit("host:updateProfile", data);
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

  const startGame = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("host:start", (res: { ok: boolean; room?: RoomState; error?: string }) => {
        if (res.ok && res.room) resolve(res.room);
        else reject(new Error(res.error ?? "Error al iniciar"));
      });
    });
  }, [socket]);

  const beginSpin = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    const code = getSessionCode();
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit(
        "host:spin",
        { code },
        (res: { ok: boolean; room?: RoomState; error?: string }) => {
          if (res.ok && res.room) resolve(res.room);
          else reject(new Error(res.error ?? "No se pudo girar"));
        }
      );
    });
  }, [socket]);

  const completeSpin = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<SpinResultPayload>((resolve, reject) => {
      socket.emit(
        "host:spinComplete",
        { code: getSessionCode() },
        (res: {
          ok: boolean;
          spinResult?: SpinResultPayload;
          error?: string;
        }) => {
          if (res.ok && res.spinResult) {
            setLastSpinResult(res.spinResult);
            resolve(res.spinResult);
          } else reject(new Error(res.error ?? "Error al completar giro"));
        }
      );
    });
  }, [socket]);

  const submitDrunkLevel = useCallback(
    (level: number) => {
      if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit(
          "player:submitDrunkLevel",
          { level },
          (res: { ok: boolean; room?: RoomState; error?: string }) => {
            if (res.ok && res.room) {
              setRoom(res.room);
              resolve(res.room);
            } else reject(new Error(res.error ?? "No se pudo confirmar nivel"));
          }
        );
      });
    },
    [socket]
  );

  const markDrank = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<void>((resolve, reject) => {
      socket.emit("player:drank", (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(new Error(res.error ?? "Error"));
      });
    });
  }, [socket]);

  const markCompleted = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<void>((resolve, reject) => {
      socket.emit("player:completed", (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(new Error(res.error ?? "Error"));
      });
    });
  }, [socket]);

  const markSkipped = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<void>((resolve, reject) => {
      socket.emit("player:skipped", (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(new Error(res.error ?? "Error"));
      });
    });
  }, [socket]);

  const continueGame = useCallback(() => {
    if (!socket) return Promise.reject(new Error("Sin conexión al servidor"));
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("host:continue", (res: { ok: boolean; room?: RoomState }) => {
        if (res.ok && res.room) resolve(res.room);
        else reject(new Error("Error al continuar"));
      });
    });
  }, [socket]);

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

  const playerId = socket?.id ?? "";
  const isHost = room?.hostId === playerId;

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
