import { useState } from "react";
import type { Player } from "@shared/types";
import { sounds } from "../utils/sounds";

interface Props {
  players: Player[];
  onSubmit: (updates: Record<string, number>) => void;
  roundLabel?: string;
}

export default function DrunkCheckModal({ players, onSubmit, roundLabel }: Props) {
  const [levels, setLevels] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    players.forEach((p) => {
      init[p.id] = p.drunkLevel;
    });
    return init;
  });

  const handleSubmit = () => {
    sounds.click();
    onSubmit(levels);
  };

  const avg =
    players.length > 0
      ? (
          players.reduce((s, p) => s + (levels[p.id] ?? p.drunkLevel), 0) /
          players.length
        ).toFixed(1)
      : "0";

  return (
    <div className="challenge-card">
      <h2>⏸️ Pausa borrachera</h2>
      <p className="muted">
        {roundLabel ?? "¿Cómo vais ahora?"} Media del grupo: <strong>{avg}</strong> ·
        Objetivo: 7.5–8.5
      </p>
      {players.map((p) => (
        <div key={p.id} className="slider-row">
          <label className="label">
            {p.name} — {levels[p.id] ?? p.drunkLevel}/10
            {p.isFino && " 🍻 FINO"}
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={levels[p.id] ?? p.drunkLevel}
            onChange={(e) =>
              setLevels((prev) => ({
                ...prev,
                [p.id]: Number(e.target.value),
              }))
            }
          />
        </div>
      ))}
      <button className="btn btn-cyan" onClick={handleSubmit}>
        Actualizar y seguir
      </button>
    </div>
  );
}
