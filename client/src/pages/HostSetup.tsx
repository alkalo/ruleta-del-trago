import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import type {
  Vibe,
  ChallengeType,
  OrientationPref,
  ContentLevel,
  GameSettings,
  Gender,
} from "@shared/types";
import GenderPicker from "../components/GenderPicker";
import { isBirthdayName } from "../constants/birthday";
import {
  ALL_VIBES,
  ALL_CHALLENGE_TYPES,
  COUPLE_ORIENTATIONS,
  ALL_CONTENT_LEVELS,
  VIBE_LABELS,
  CHALLENGE_TYPE_LABELS,
  ORIENTATION_LABELS,
  CONTENT_LEVEL_LABELS,
} from "@shared/types";

const STEPS = 5;

export default function HostSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const { setSettings, updateHostProfile, room } = useSocket();

  const [step, setStep] = useState(0);
  const [vibes, setVibes] = useState<Vibe[]>([
    "risas",
    "locura",
    "competicion",
  ]);
  const [challengeTypes, setChallengeTypes] = useState<ChallengeType[]>([
    ...ALL_CHALLENGE_TYPES,
  ]);
  const [coupleChallengesEnabled, setCoupleChallengesEnabled] = useState(true);
  const [orientations, setOrientations] = useState<OrientationPref[]>([
    ...COUPLE_ORIENTATIONS,
  ]);
  const [contentLevel, setContentLevel] = useState<ContentLevel>("medio");
  const [stripEnabled, setStripEnabled] = useState(true);
  const [hostName, setHostName] = useState("");
  const [hostDrunk, setHostDrunk] = useState(5);
  const [hostDrinks, setHostDrinks] = useState(true);
  const [hostGender, setHostGender] = useState<Gender | null>(null);

  const toggle = <T extends string>(list: T[], item: T, set: (v: T[]) => void) => {
    sounds.click();
    if (list.includes(item)) {
      if (list.length > 1) set(list.filter((x) => x !== item));
    } else {
      set([...list, item]);
    }
  };

  const next = () => {
    sounds.click();
    setStep((s) => Math.min(s + 1, STEPS - 1));
  };

  const back = () => {
    sounds.click();
    setStep((s) => Math.max(s - 1, 0));
  };

  const finish = async () => {
    sounds.success();
    const settings: GameSettings = {
      vibes,
      challengeTypes,
      coupleChallengesEnabled,
      orientations: coupleChallengesEnabled ? orientations : ["neutro"],
      contentLevel,
      stripEnabled,
    };
    const roomCode = code || room?.code;
    if (!roomCode) {
      alert("No hay código de sala. Vuelve a crear la partida.");
      return;
    }
    if (!hostGender) {
      alert("Elige tu género: lo usamos para emparejar retos.");
      return;
    }
    try {
      updateHostProfile({
        name: hostName.trim() || undefined,
        drunkLevel: hostDrunk,
        drinksAlcohol: hostDrinks,
        gender: hostGender,
      });
      await setSettings(settings, roomCode);
      navigate(`/lobby/${roomCode}`);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al guardar configuración";
      alert(msg);
    }
  };

  return (
    <div>
      <h1>Configurar fiesta</h1>
      <p className="muted">Paso {step + 1} de {STEPS} — así se generará el juego</p>

      <div className="step-indicator">
        {Array.from({ length: STEPS }).map((_, i) => (
          <div
            key={i}
            className={`step-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="card">
          <h2>Vibes de la noche</h2>
          <p className="muted">Multiselección. Marca el mood.</p>
          <div className="chip-grid">
            {ALL_VIBES.map((v) => (
              <button
                key={v}
                className={`chip ${vibes.includes(v) ? "selected" : ""}`}
                onClick={() => toggle(vibes, v, setVibes)}
              >
                {VIBE_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2>Tipos de retos</h2>
          <p className="muted">
            Solo salen los tipos que marques. Si dejas minijuego, pueden salir
            minijuegos. Si solo quieres físicos, desmarca el resto.
          </p>
          <div className="chip-grid">
            {ALL_CHALLENGE_TYPES.map((t) => (
              <button
                key={t}
                className={`chip ${challengeTypes.includes(t) ? "selected" : ""}`}
                onClick={() => toggle(challengeTypes, t, setChallengeTypes)}
              >
                {CHALLENGE_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>Orientación y contenido</h2>
          <p className="muted">
            Los retos neutros (sin romance) valen para todos. Un reto gay,
            lesbiana o hetero solo sale si marcas esa orientación. El nivel es
            un techo: en picante no entra «sin límite», y priorizamos retos
            picantes de verdad.
          </p>
          <label className="label">Retos de pareja / contacto físico</label>
          <div className="chip-grid">
            <button
              className={`chip ${coupleChallengesEnabled ? "selected" : ""}`}
              onClick={() => {
                sounds.click();
                setCoupleChallengesEnabled(true);
                if (orientations.length === 0) {
                  setOrientations([...COUPLE_ORIENTATIONS]);
                }
              }}
            >
              Activados
            </button>
            <button
              className={`chip ${!coupleChallengesEnabled ? "selected" : ""}`}
              onClick={() => {
                sounds.click();
                setCoupleChallengesEnabled(false);
              }}
            >
              Desactivados (solo neutro)
            </button>
          </div>
          {coupleChallengesEnabled && (
            <>
              <label className="label">Orientaciones para retos de pareja</label>
              <p className="muted">Multiselección. Neutro no aplica aquí.</p>
              <div className="chip-grid">
                {COUPLE_ORIENTATIONS.map((o) => (
                  <button
                    key={o}
                    className={`chip ${orientations.includes(o) ? "selected" : ""}`}
                    onClick={() => toggle(orientations, o, setOrientations)}
                  >
                    {ORIENTATION_LABELS[o]}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="label">Nivel de contenido</label>
          <div className="chip-grid">
            {ALL_CONTENT_LEVELS.map((c) => (
              <button
                key={c}
                className={`chip ${contentLevel === c ? "selected" : ""}`}
                onClick={() => {
                  sounds.click();
                  setContentLevel(c);
                }}
              >
                {CONTENT_LEVEL_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2>Strip y límites</h2>
          <p className="muted">Sin límite en contenido, pero strip es opcional.</p>
          <div className="chip-grid">
            <button
              className={`chip ${stripEnabled ? "selected" : ""}`}
              onClick={() => {
                sounds.click();
                setStripEnabled(true);
              }}
            >
              Strip ON
            </button>
            <button
              className={`chip ${!stripEnabled ? "selected" : ""}`}
              onClick={() => {
                sounds.click();
                setStripEnabled(false);
              }}
            >
              Strip OFF
            </button>
          </div>
          <p className="muted">
            Intensidad sube con el tiempo automáticamente. Pausas de copas
            cada 4 rondas.
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h2>Último paso</h2>
          <label className="label">Tu nombre (host)</label>
          <input
            className="input"
            placeholder="DJ del descontrol"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
          />
          {isBirthdayName(hostName) && (
            <p className="birthday-home-tagline">🎂 Bru, hoy se juega por ti.</p>
          )}
          <div className="slider-row">
            <label className="label">Tu nivel (1–10): {hostDrunk}</label>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={hostDrunk}
              onChange={(e) => setHostDrunk(Number(e.target.value))}
            />
          </div>
          <div className="chip-grid">
            <button
              className={`chip ${hostDrinks ? "selected" : ""}`}
              onClick={() => setHostDrinks(true)}
            >
              🍺 Bebo
            </button>
            <button
              className={`chip ${!hostDrinks ? "selected" : ""}`}
              onClick={() => setHostDrinks(false)}
            >
              🧃 Sin alcohol
            </button>
          </div>
          <GenderPicker value={hostGender} onChange={setHostGender} />
          <h3>Resumen</h3>
          <p className="muted">
            Vibes: {vibes.map((v) => VIBE_LABELS[v]).join(", ")}
          </p>
          <p className="muted">
            Tipos: {challengeTypes.map((t) => CHALLENGE_TYPE_LABELS[t]).join(", ")}
          </p>
          <p className="muted">
            Retos pareja: {coupleChallengesEnabled ? "sí" : "no"}
            {coupleChallengesEnabled
              ? ` · Orientaciones: ${orientations.map((o) => ORIENTATION_LABELS[o]).join(", ")}`
              : " · solo neutro"}{" "}
            · Contenido: {CONTENT_LEVEL_LABELS[contentLevel]}
          </p>
          <p className="muted">
            Strip: {stripEnabled ? "sí" : "no"} · Pack del servidor
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {step > 0 && (
          <button className="btn btn-secondary" onClick={back} style={{ flex: 1 }}>
            Atrás
          </button>
        )}
        {step < STEPS - 1 ? (
          <button className="btn btn-primary" onClick={next} style={{ flex: 2 }}>
            Siguiente
          </button>
        ) : (
          <button
            className="btn btn-cyan"
            onClick={finish}
            style={{ flex: 2 }}
            disabled={!hostGender}
          >
            Abrir lobby
          </button>
        )}
      </div>
    </div>
  );
}
