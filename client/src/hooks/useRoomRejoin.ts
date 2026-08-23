import { useEffect, useRef, useState } from "react";
import { RoomRejoinError, useSocket } from "../context/SocketContext";

export interface RoomLoadError {
  kind: "expired" | "failed";
  message: string;
}

const REJOIN_TIMEOUT_MS = 8000;

export function useRoomRejoin(code: string | undefined) {
  const { room, socket, rejoinByCode } = useSocket();
  const [loadError, setLoadError] = useState<RoomLoadError | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    if (room) {
      setLoadError(null);
      return;
    }
    const id = window.setTimeout(() => {
      if (!roomRef.current) {
        setLoadError((prev) =>
          prev ?? { kind: "expired", message: "La sala expiró. Crea otra." }
        );
      }
    }, REJOIN_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [room, code]);

  useEffect(() => {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) {
      setLoadError({ kind: "expired", message: "La sala expiró. Crea otra." });
      return;
    }
    if (room || !socket) return;

    let cancelled = false;
    void rejoinByCode(normalized).then(
      () => {
        if (!cancelled) setLoadError(null);
      },
      (error: unknown) => {
        if (cancelled || roomRef.current) return;
        if (error instanceof RoomRejoinError && error.kind === "expired") {
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
  }, [code, room, socket, rejoinByCode]);

  return { loadError };
}
