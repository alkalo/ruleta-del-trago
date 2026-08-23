import { useState } from "react";
import type { Player } from "@shared/types";
import { sounds } from "../utils/sounds";

interface Props {
  players: Player[];
  playerId: string;
  drunkCheckSubmitted: Record<string, boolean>;
  onSubmit: (level: number) => Promise<void>;
  roundLabel?: string;
}

export default function DrunkCheckModal({
  players,
  playerId,
  drunkCheckSubmitted,
  onSubmit,
  roundLabel,
}: Props) {
  const me = players.find((p) => p.id === playerId);
  const [level, setLevel] = useState(me?.drunkLevel ?? 5);
  const [submitting, setSubmitting] = useState(false);

  const connected = players.filter((p) => p.connected);
  const submitted = drunkCheckSubmitted[playerId] === true;
  const pending = connected.filter((p) => !drunkCheckSubmitted[p.id]);

  const avg =
    connected.length > 0
      ? (
          connected.reduce((s, p) => s + p.drunkLevel, 0) / connected.length
        ).toFixed(1)
      : "0";

  const handleSubmit = async () => {
    sounds.click();
    setSubmitting(true);
    try {
      await onSubmit(level);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="challenge-card">
      <h2>⏸️ Pausa borrachera</h2>
      <p className="muted">
        {roundLabel ?? "¿Cómo vas ahora?"} Media del grupo: <strong>{avg}</strong>{" "}
        · Objetivo: 7.5–8.5
      </p>

      {!submitted && me && (
        <>
          <div className="slider-row">
            <label className="label">
              Tu nivel — {level}/10
              {me.isFino && " 🍻 FINO"}
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </div>
          <button
            className="btn btn-cyan"
            onClick={handleSubmit}
            disabled={submitting}
          >
            Confirmar mi nivel
          </button>
        </>
      )}

      {submitted && (
        <p className="muted" style={{ textAlign: "center" }}>
          ✓ Nivel confirmado. Esperando al resto…
        </p>
      )}

      {pending.length > 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          Faltan: {pending.map((p) => p.name).join(", ")}
        </p>
      )}

      {pending.length === 0 && connected.length > 0 && (
        <p className="muted" style={{ marginTop: 12, textAlign: "center" }}>
          Todos confirmaron. ¡A seguir!
        </p>
      )}
    </div>
  );
}
