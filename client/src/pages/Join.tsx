import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import type { Gender } from "@shared/types";
import GenderPicker from "../components/GenderPicker";
import { isBirthdayName } from "../constants/birthday";

export default function Join() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { joinRoom, connected } = useSocket();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [name, setName] = useState("");
  const [drunkLevel, setDrunkLevel] = useState(5);
  const [drinksAlcohol, setDrinksAlcohol] = useState(true);
  const [gender, setGender] = useState<Gender | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const c = searchParams.get("code");
    if (c) setCode(c.toUpperCase());
  }, [searchParams]);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim() || !gender) return;
    sounds.click();
    setLoading(true);
    try {
      const room = await joinRoom(
        code.trim().toUpperCase(),
        name.trim(),
        drunkLevel,
        drinksAlcohol,
        gender
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
          : "No se pudo unir. ¿Código correcto? Si la partida ya empezó, usa el mismo nombre."
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
      {isBirthdayName(name) && (
        <p className="birthday-home-tagline">🎂 Bru, hoy se juega por ti.</p>
      )}

      <div className="slider-row">
        <label className="label">
          ¿Cómo vas? Tu nivel (1–10): {drunkLevel}
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
            🧃 Sin alcohol (igual de caos)
          </button>
        </div>
        {!drinksAlcohol && (
          <p className="muted">
            Designado responsable del caos. Castigos alternativos meme
            garantizados.
          </p>
        )}
      </div>

      <div className="card">
        <GenderPicker value={gender} onChange={setGender} />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleJoin}
        disabled={!connected || loading || !code || !name || !gender}
      >
        {loading ? "Entrando…" : "Entrar a la sala"}
      </button>
    </div>
  );
}
