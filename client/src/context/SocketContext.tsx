import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import type { RoomState, GameSettings, Challenge } from "@shared/types";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin);

const SESSION_KEY = "ruleta-del-trago-session";

export interface SpinResultPayload {
  targets: string[];
  mode: string;
  challenge: Challenge;
  drinkAmounts: Record<string, number>;
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
    drinksAlcohol: boolean
  ) => Promise<RoomState>;
  setSettings: (settings: GameSettings) => Promise<RoomState>;
  updateHostName: (name: string) => void;
  updateHostProfile: (data: {
    name?: string;
    drunkLevel?: number;
    drinksAlcohol?: boolean;
  }) => void;
  startGame: () => Promise<RoomState>;
  beginSpin: () => Promise<RoomState>;
  completeSpin: () => Promise<SpinResultPayload>;
  updateDrunkLevels: (updates: Record<string, number>) => Promise<RoomState>;
  finishDrunkCheck: () => Promise<RoomState>;
  markDrank: () => Promise<void>;
  markCompleted: () => Promise<void>;
  markSkipped: () => Promise<void>;
  addChallenge: (challenge: Omit<Challenge, "id">) => Promise<RoomState>;
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
    const s = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    setSocket(s);
    s.on("room:update", (r: RoomState) => setRoom(r));

    const tryRejoin = () => {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as {
          code: string;
          name: string;
          drunkLevel: number;
          drinksAlcohol: boolean;
        };
        s.emit(
          "room:join",
          {
            code: data.code,
            name: data.name,
            drunkLevel: data.drunkLevel,
            drinksAlcohol: data.drinksAlcohol,
          },
          (res: { ok: boolean; room?: RoomState }) => {
            if (res.ok && res.room) setRoom(res.room);
          }
        );
      } catch {
        /* ignore */
      }
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
    if (!socket) return Promise.reject("No socket");
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("room:create", (res: { ok: boolean; room?: RoomState }) => {
        if (res.ok && res.room) {
          sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              code: res.room.code,
              name: "Host",
              drunkLevel: 5,
              drinksAlcohol: true,
            })
          );
          setRoom(res.room);
          resolve(res.room);
        } else reject("Error creating room");
      });
    });
  }, [socket]);

  const joinRoom = useCallback(
    (
      code: string,
      name: string,
      drunkLevel: number,
      drinksAlcohol: boolean
    ) => {
      if (!socket) return Promise.reject("No socket");
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit(
          "room:join",
          { code, name, drunkLevel, drinksAlcohol },
          (res: { ok: boolean; room?: RoomState; error?: string }) => {
            if (res.ok && res.room) {
              sessionStorage.setItem(
                SESSION_KEY,
                JSON.stringify({
                  code: res.room.code,
                  name,
                  drunkLevel,
                  drinksAlcohol,
                })
              );
              setRoom(res.room);
              resolve(res.room);
            } else reject(res.error ?? "Error");
          }
        );
      });
    },
    [socket]
  );

  const setSettings = useCallback(
    (settings: GameSettings) => {
      if (!socket) return Promise.reject("No socket");
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit("host:settings", settings, (res: { ok: boolean; room?: RoomState }) => {
          if (res.ok && res.room) resolve(res.room);
          else reject("Error");
        });
      });
    },
    [socket]
  );

  const updateHostName = useCallback(
    (name: string) => {
      if (socket) socket.emit("host:updateName", name);
    },
    [socket]
  );

  const updateHostProfile = useCallback(
    (data: { name?: string; drunkLevel?: number; drinksAlcohol?: boolean }) => {
      if (socket) socket.emit("host:updateProfile", data);
    },
    [socket]
  );

  const startGame = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("host:start", (res: { ok: boolean; room?: RoomState; error?: string }) => {
        if (res.ok && res.room) resolve(res.room);
        else reject(res.error ?? "Error");
      });
    });
  }, [socket]);

  const beginSpin = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("host:spin", (res: { ok: boolean; room?: RoomState }) => {
        if (res.ok && res.room) resolve(res.room);
        else reject("Error");
      });
    });
  }, [socket]);

  const completeSpin = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<SpinResultPayload>((resolve, reject) => {
      socket.emit(
        "host:spinComplete",
        (res: { ok: boolean; spinResult?: SpinResultPayload }) => {
          if (res.ok && res.spinResult) {
            setLastSpinResult(res.spinResult);
            resolve(res.spinResult);
          } else reject("Error");
        }
      );
    });
  }, [socket]);

  const updateDrunkLevels = useCallback(
    (updates: Record<string, number>) => {
      if (!socket) return Promise.reject("No socket");
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit(
          "game:drunkLevels",
          updates,
          (res: { ok: boolean; room?: RoomState }) => {
            if (res.ok && res.room) resolve(res.room);
            else reject("Error");
          }
        );
      });
    },
    [socket]
  );

  const finishDrunkCheck = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("game:finishDrunkCheck", (res: { ok: boolean; room?: RoomState }) => {
        if (res.ok && res.room) resolve(res.room);
        else reject("Error");
      });
    });
  }, [socket]);

  const markDrank = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<void>((resolve, reject) => {
      socket.emit("player:drank", (res: { ok: boolean }) => {
        if (res.ok) resolve();
        else reject("Error");
      });
    });
  }, [socket]);

  const markCompleted = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<void>((resolve, reject) => {
      socket.emit("player:completed", (res: { ok: boolean }) => {
        if (res.ok) resolve();
        else reject("Error");
      });
    });
  }, [socket]);

  const markSkipped = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<void>((resolve, reject) => {
      socket.emit("player:skipped", (res: { ok: boolean }) => {
        if (res.ok) resolve();
        else reject("Error");
      });
    });
  }, [socket]);

  const addChallenge = useCallback(
    (challenge: Omit<Challenge, "id">) => {
      if (!socket) return Promise.reject("No socket");
      return new Promise<RoomState>((resolve, reject) => {
        socket.emit(
          "host:addChallenge",
          challenge,
          (res: { ok: boolean; room?: RoomState }) => {
            if (res.ok && res.room) resolve(res.room);
            else reject("Error");
          }
        );
      });
    },
    [socket]
  );

  const continueGame = useCallback(() => {
    if (!socket) return Promise.reject("No socket");
    return new Promise<RoomState>((resolve, reject) => {
      socket.emit("host:continue", (res: { ok: boolean; room?: RoomState }) => {
        if (res.ok && res.room) resolve(res.room);
        else reject("Error");
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
        updateDrunkLevels,
        finishDrunkCheck,
        markDrank,
        markCompleted,
        markSkipped,
        addChallenge,
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
