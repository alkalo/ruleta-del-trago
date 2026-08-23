import { sounds } from "../utils/sounds";

interface Props {
  onContinue: () => void;
  isHost: boolean;
}

export default function VictoryScreen({ onContinue, isHost }: Props) {
  return (
    <div className="challenge-card" style={{ borderColor: "var(--cyan)" }}>
      <h2>🏆 NIVEL PERFECTO</h2>
      <p className="challenge-text">
        Todos entre 7.5 y 8.5. Habéis completado el objetivo de la noche como
        profesionales del trago responsable (casi).
      </p>
      {isHost ? (
        <button
          className="btn btn-cyan"
          onClick={() => {
            sounds.success();
            onContinue();
          }}
        >
          Seguir jugando igual
        </button>
      ) : (
        <p className="muted">El host decide si sigue la fiesta…</p>
      )}
    </div>
  );
}
