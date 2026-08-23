import { useEffect, useState } from "react";
import type { Player } from "@shared/types";
import { sounds } from "../utils/sounds";

interface Props {
  players: Player[];
  playerId: string;
  clientKey?: string;
  isHost?: boolean;
  drunkCheckSubmitted: Record<string, boolean>;
  onSubmit: (level: number) => Promise<void>;
  roundLabel?: string;
}

function hasSubmitted(
  player: Player,
  map: Record<string, boolean>,
  fallbackId?: string
): boolean {
  if (player.clientKey && map[player.clientKey] === true) return true;
  if (map[player.id] === true) return true;
  if (fallbackId && map[fallbackId] === true) return true;
  return false;
}

export default function DrunkCheckModal({
  players,
  playerId,
  clientKey,
  isHost,
  drunkCheckSubmitted,
  onSubmit,
  roundLabel,
}: Props) {
  const me =
    players.find((p) => p.id === playerId) ??
    players.find((p) => clientKey && p.clientKey === clientKey) ??
    (isHost ? players.find((p) => p.isHost) : undefined);

  const [level, setLevel] = useState(me?.drunkLevel ?? 5);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLevel(me?.drunkLevel ?? 5);
    setSubmitting(false);
  }, [playerId, clientKey, me?.id, me?.drunkLevel]);

  const connected = players.filter((p) => p.connected);
  const submitted = me
    ? hasSubmitted(me, drunkCheckSubmitted, playerId)
    : drunkCheckSubmitted[playerId] === true;
  const pending = connected.filter(
    (p) => !hasSubmitted(p, drunkCheckSubmitted)
  );

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
      <h2>⏸️ Pausa de copas</h2>
      <p className="muted">
        {roundLabel ?? "¿Cómo vas ahora?"} Media del grupo: <strong>{avg}</strong>{" "}
        · Objetivo: 7.5–8.5
      </p>
      <p className="muted">
        Este número decide cuántos tragos te tocan hasta la próxima pausa.
        Beber no sube el medidor: solo lo actualizas aquí, en tu móvil.
      </p>

      {!submitted && me && (
        <>
          <div className="slider-row">
            <label className="label">
              Tu nivel — {level}/10
              {me?.isFino && " 🍻 FINO"}
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

      {!me && (
        <p className="muted">
          No te reconocemos en esta sala. Recarga o entra de nuevo con el mismo
          nombre.
        </p>
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
