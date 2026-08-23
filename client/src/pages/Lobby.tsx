import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import PlayerList from "../components/PlayerList";
import RoomLoadError from "../components/RoomLoadError";
import { useRoomRejoin } from "../hooks/useRoomRejoin";
import { BIRTHDAY_NAME, hasBirthdayPlayer } from "../constants/birthday";

export default function Lobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { loadError } = useRoomRejoin(code);
  const { room, isHost, startGame, connected } = useSocket();

  const roomCode = code ?? room?.code ?? "";
  const players = room?.players.filter((p) => p.connected) ?? [];
  const canStart = players.length >= 2 && isHost;

  useEffect(() => {
    if (room && room.phase !== "setup" && room.phase !== "lobby") {
      navigate(`/game/${room.code}`);
    }
  }, [room?.phase, room?.code, navigate]);

  const handleStart = async () => {
    sounds.success();
    try {
      await startGame();
      navigate(`/game/${roomCode}`);
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Necesitas al menos 2 jugadores conectados"
      );
    }
  };

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join`
      : "/join";

  const copyCode = () => {
    sounds.click();
    navigator.clipboard?.writeText(roomCode);
    alert(`Código copiado: ${roomCode}`);
  };

  const shareJoin = () => {
    sounds.click();
    const url = `${window.location.origin}/join?code=${roomCode}`;
    if (navigator.share) {
      navigator.share({
        title: "Ruleta del Trago",
        text: `Uníos a mi sala. Código: ${roomCode}`,
        url,
      });
    } else {
      navigator.clipboard?.writeText(url);
      alert(`Link copiado: ${url}`);
    }
  };

  if (loadError) {
    return <RoomLoadError error={loadError} code={roomCode} />;
  }

  if (!room) {
    return (
      <div>
        <h1>Cargando sala…</h1>
        <p className="muted">Código: {roomCode}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Lobby</h1>
      <p className="muted">Comparte el código con tus amigos</p>

      <div className="share-code" onClick={copyCode}>{roomCode}</div>
      <p className="muted" style={{ textAlign: "center" }}>
        Toca el código para copiar · Entrada: {shareUrl}
      </p>

      <button className="btn btn-cyan" onClick={shareJoin} style={{ marginTop: 8 }}>
        Compartir link de invitación
      </button>

      {!connected && (
        <div className="alert-banner alert-warning">Reconectando…</div>
      )}

      {hasBirthdayPlayer(players) && (
        <div className="alert-banner birthday-spin-toast">
          🎂 {BIRTHDAY_NAME} está en la sala. ¡Hoy se brinda por el cumpleañero!
        </div>
      )}

      <PlayerList players={players} title="En la sala" />

      {isHost && (
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={!canStart}
          style={{ marginTop: 16 }}
        >
          {canStart
            ? "¡Empezar la locura!"
            : `Esperando jugadores (${players.length}/2 mín)`}
        </button>
      )}

      {!isHost && (
        <div className="card" style={{ marginTop: 16 }}>
          <p>Esperando a que el host inicie… Si recargas, vuelve a entrar con el mismo nombre.</p>
        </div>
      )}
    </div>
  );
}
