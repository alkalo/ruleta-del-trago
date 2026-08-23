import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import PlayerList from "../components/PlayerList";
import HostChallengeEditor from "../components/HostChallengeEditor";

export default function Lobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
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
      alert("Necesitas al menos 2 jugadores conectados");
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

  return (
    <div>
      <h1>Lobby</h1>
      <p className="muted">Comparte el código con tus amigos</p>

      <div className="share-code" onClick={copyCode}>{roomCode}</div>
      <p className="muted" style={{ textAlign: "center" }}>
        Toca el código para copiar · Entrada: {shareUrl}
      </p>

      {!connected && (
        <div className="alert-banner alert-warning">Reconectando…</div>
      )}

      <PlayerList players={players} title="En la sala" />

      {isHost && (
        <>
          <HostChallengeEditor />
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
        </>
      )}

      {!isHost && (
        <div className="card" style={{ marginTop: 16 }}>
          <p>Esperando a que el host inicie… No refresques o te desconectas.</p>
        </div>
      )}
    </div>
  );
}
