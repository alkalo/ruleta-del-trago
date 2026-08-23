import { Link } from "react-router-dom";
import type { RoomLoadError as RoomLoadErrorState } from "../hooks/useRoomRejoin";

export default function RoomLoadError({
  error,
  code,
}: {
  error: RoomLoadErrorState;
  code?: string;
}) {
  const expired = error.kind === "expired";

  return (
    <div>
      <h1>{expired ? "La sala expiró. Crea otra." : "No se pudo entrar"}</h1>
      <p className="muted">
        {expired
          ? "El servidor se reinició o el código ya no existe."
          : error.message}
      </p>
      {code && (
        <p className="muted" style={{ textAlign: "center" }}>
          Código: {code}
        </p>
      )}
      {!expired && code && (
        <Link
          to={`/join?code=${encodeURIComponent(code)}`}
          className="btn btn-primary"
        >
          Unirse de nuevo
        </Link>
      )}
      <Link
        to="/"
        className="btn btn-secondary"
        style={{ marginTop: 12 }}
      >
        Volver al inicio
      </Link>
    </div>
  );
}
