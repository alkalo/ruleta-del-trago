import { useState } from "react";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import type { ChallengeType, Vibe, ContentLevel } from "@shared/types";
import {
  ALL_CHALLENGE_TYPES,
  CHALLENGE_TYPE_LABELS,
  ALL_VIBES,
  VIBE_LABELS,
  ALL_CONTENT_LEVELS,
  CONTENT_LEVEL_LABELS,
} from "@shared/types";

export default function HostChallengeEditor() {
  const { addChallenge } = useSocket();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<ChallengeType>("truth");
  const [intensity, setIntensity] = useState(5);
  const [vibes, setVibes] = useState<Vibe[]>(["risas"]);
  const [contentLevel, setContentLevel] = useState<ContentLevel>("medio");
  const [baseDrinks, setBaseDrinks] = useState(1);

  const submit = async () => {
    if (!text.trim()) return;
    sounds.success();
    try {
      await addChallenge({
        type,
        intensity,
        vibes,
        text: text.trim(),
        baseDrinks,
        orientations: ["pan", "neutro", "hetero", "gay", "lesbiana", "bi"],
        contentLevel,
      });
      setText("");
      setOpen(false);
      alert("Reto añadido al pool de la sala");
    } catch {
      alert("Error al añadir reto");
    }
  };

  if (!open) {
    return (
      <button
        className="btn btn-secondary"
        style={{ marginTop: 12 }}
        onClick={() => {
          sounds.click();
          setOpen(true);
        }}
      >
        + Añadir reto custom
      </button>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>Reto personalizado</h3>
      <p className="muted">Usa {"{player}"} y {"{other}"} en el texto</p>
      <textarea
        className="input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="{player}, haz algo absurdo con {other}"
      />
      <label className="label">Tipo</label>
      <select
        className="select"
        value={type}
        onChange={(e) => setType(e.target.value as ChallengeType)}
      >
        {ALL_CHALLENGE_TYPES.map((t) => (
          <option key={t} value={t}>{CHALLENGE_TYPE_LABELS[t]}</option>
        ))}
      </select>
      <label className="label">Intensidad ({intensity})</label>
      <input
        type="range"
        min={1}
        max={10}
        value={intensity}
        onChange={(e) => setIntensity(Number(e.target.value))}
      />
      <label className="label">Tragos base ({baseDrinks})</label>
      <input
        type="range"
        min={1}
        max={3}
        step={0.5}
        value={baseDrinks}
        onChange={(e) => setBaseDrinks(Number(e.target.value))}
      />
      <label className="label">Contenido</label>
      <select
        className="select"
        value={contentLevel}
        onChange={(e) => setContentLevel(e.target.value as ContentLevel)}
      >
        {ALL_CONTENT_LEVELS.map((c) => (
          <option key={c} value={c}>{CONTENT_LEVEL_LABELS[c]}</option>
        ))}
      </select>
      <div className="chip-grid">
        {ALL_VIBES.map((v) => (
          <button
            key={v}
            className={`chip ${vibes.includes(v) ? "selected" : ""}`}
            onClick={() => {
              sounds.click();
              setVibes((prev) =>
                prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
              );
            }}
          >
            {VIBE_LABELS[v]}
          </button>
        ))}
      </div>
      <button className="btn btn-cyan" onClick={submit}>Guardar reto</button>
      <button
        className="btn btn-secondary"
        style={{ marginTop: 8 }}
        onClick={() => setOpen(false)}
      >
        Cancelar
      </button>
    </div>
  );
}
