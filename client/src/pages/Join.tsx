import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";

export default function Join() {
  const navigate = useNavigate();
  const { joinRoom, connected } = useSocket();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [drunkLevel, setDrunkLevel] = useState(5);
  const [drinksAlcohol, setDrinksAlcohol] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim()) return;
    sounds.click();
    setLoading(true);
    try {
      const room = await joinRoom(
        code.trim().toUpperCase(),
        name.trim(),
        drunkLevel,
        drinksAlcohol
      );
      if (room.phase === "lobby") {
        navigate(`/lobby/${room.code}`);
      } else {
        navigate(`/game/${room.code}`);
      }
    } catch (e) {
      alert(
        typeof e === "string"
          ? e
          : "No se pudo unir. ¿Código correcto y sala en lobby?"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Unirse</h1>
      <p className="muted">Pide el código al host de la fiesta.</p>

      <label className="label">Código de sala</label>
      <input
        className="input"
        placeholder="ABCDE"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={5}
      />

      <label className="label">Tu nombre</label>
      <input
        className="input"
        placeholder="El que no para de hablar"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="slider-row">
        <label className="label">
          ¿Cómo vas de borracho? ({drunkLevel}/10)
        </label>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={drunkLevel}
          onChange={(e) => setDrunkLevel(Number(e.target.value))}
        />
      </div>

      <div className="card">
        <label className="label">¿Bebes alcohol esta noche?</label>
        <div className="chip-grid">
          <button
            className={`chip ${drinksAlcohol ? "selected" : ""}`}
            onClick={() => {
              setDrinksAlcohol(true);
              sounds.click();
            }}
          >
            🍺 Sí, a tope
          </button>
          <button
            className={`chip ${!drinksAlcohol ? "selected" : ""}`}
            onClick={() => {
              setDrinksAlcohol(false);
              sounds.click();
            }}
          >
            🧃 Sobrio/a (pero igual de loco)
          </button>
        </div>
        {!drinksAlcohol && (
          <p className="muted">
            Designado responsable del caos. Castigos alternativos meme garantizados.
          </p>
        )}
      </div>

      <button
        className="btn btn-primary"
        onClick={handleJoin}
        disabled={!connected || loading || !code || !name}
      >
        {loading ? "Entrando…" : "Entrar a la sala"}
      </button>
    </div>
  );
}
