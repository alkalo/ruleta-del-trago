import { useEffect, useRef, useState } from "react";
import {
  clearPlayerSession,
  RoomRejoinError,
  useSocket,
} from "../context/SocketContext";

export interface RoomLoadError {
  kind: "expired" | "failed";
  message: string;
}

const REJOIN_TIMEOUT_MS = 20000;

export function useRoomRejoin(code: string | undefined) {
  const { room, socket, connected, rejoinByCode } = useSocket();
  const [loadError, setLoadError] = useState<RoomLoadError | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    if (room) {
      setLoadError(null);
      return;
    }
    if (!connected) return;
    const id = window.setTimeout(() => {
      if (!roomRef.current) {
        setLoadError((prev) =>
          prev ?? {
            kind: "failed",
            message:
              "No se pudo entrar. Recarga o ve a inicio y crea otra sala.",
          }
        );
      }
    }, REJOIN_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [room, code, connected]);

  useEffect(() => {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) {
      setLoadError({ kind: "expired", message: "La sala expiró. Crea otra." });
      return;
    }
    if (room || !socket || !connected) return;

    let cancelled = false;
    void rejoinByCode(normalized).then(
      () => {
        if (!cancelled) setLoadError(null);
      },
      (error: unknown) => {
        if (cancelled || roomRef.current) return;
        if (error instanceof RoomRejoinError && error.kind === "expired") {
          clearPlayerSession();
          setLoadError({
            kind: "expired",
            message: "La sala expiró. Crea otra.",
          });
          return;
        }
        setLoadError({
          kind: "failed",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo reconectar. Entra de nuevo con el mismo nombre.",
        });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [code, room, socket, connected, rejoinByCode]);

  return { loadError };
}
