import { useEffect } from "react";
import { Link } from "react-router-dom";
import { abandonPlayerSession } from "../context/SocketContext";
import type { RoomLoadError as RoomLoadErrorState } from "../hooks/useRoomRejoin";

export default function RoomLoadError({
  error,
  code,
}: {
  error: RoomLoadErrorState;
  code?: string;
}) {
  const expired = error.kind === "expired";

  useEffect(() => {
    abandonPlayerSession();
  }, []);

  return (
    <div>
      <h1>{expired ? "La sala ya no existe" : "No se pudo entrar"}</h1>
      <p className="muted">
        {expired
          ? "El servidor se reinició o el código caducó. No recargues un enlace /game/ viejo: ve a inicio y crea otra."
          : error.message}
      </p>
      {code && (
        <p className="muted" style={{ textAlign: "center" }}>
          Código: {code}
        </p>
      )}
      <Link
        to="/"
        className="btn btn-primary"
        onClick={() => abandonPlayerSession()}
      >
        Crear nueva partida
      </Link>
      <Link
        to="/join"
        className="btn btn-secondary"
        style={{ marginTop: 12 }}
        onClick={() => abandonPlayerSession()}
      >
        Unirse
      </Link>
    </div>
  );
}
