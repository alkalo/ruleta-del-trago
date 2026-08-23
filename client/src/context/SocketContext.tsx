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

    const joinAsPlayer = (data: SessionData) => {
      s.emit(
        "room:join",
        {
          code: data.code,
          name: data.name,
          drunkLevel: data.drunkLevel,
          drinksAlcohol: data.drinksAlcohol,
          gender: normalizeGender(data.gender),
        },
        (joinRes: { ok: boolean; room?: RoomState }) => {
          if (joinRes.ok && joinRes.room) setRoom(joinRes.room);
        }
      );
    };

    const tryRejoin = () => {
      const data = readSession();
      if (!data?.code) return;
      if (data.isHost === false) {
        joinAsPlayer(data);
        return;
      }
      s.emit(
        "room:rejoinHost",
        { code: data.code },
        (res: { ok: boolean; room?: RoomState }) => {
          if (res.ok && res.room) {
            setRoom(res.room);
            return;
          }
          joinAsPlayer(data);
        }
      );
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
          saveSession({
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
              saveSession({
                code: res.room.code,
                name,
                drunkLevel,
                drinksAlcohol,
                gender,
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
      if (session) {
        saveSession({
          ...session,
          ...(data.name ? { name: data.name } : {}),
          ...(data.drunkLevel !== undefined
            ? { drunkLevel: data.drunkLevel }
            : {}),
          ...(data.drinksAlcohol !== undefined
            ? { drinksAlcohol: data.drinksAlcohol }
            : {}),
          ...(data.gender !== undefined
            ? { gender: normalizeGender(data.gender) }
            : {}),
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
