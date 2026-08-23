import type { Player } from "@shared/types";

interface Props {
  players: Player[];
  title?: string;
}

export default function PlayerList({ players, title }: Props) {
  return (
    <div className="card">
      {title && <h3>{title} ({players.length})</h3>}
      {players.map((p) => (
        <div key={p.id} className="player-row">
          <div>
            <strong>{p.name}</strong>
            {p.isHost && <span className="badge">HOST</span>}
            {!p.drinksAlcohol && (
              <span className="badge badge-sober">SOBRE</span>
            )}
            {p.isFino && <span className="badge badge-fino">FINO</span>}
            <div className="drunk-bar">
              <div
                className="drunk-fill"
                style={{ width: `${(p.drunkLevel / 10) * 100}%` }}
              />
            </div>
            <span className="muted">{p.drunkLevel}/10</span>
          </div>
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            🍺 {p.stats.drinksTaken} · ✓ {p.stats.challengesCompleted}
          </div>
        </div>
      ))}
    </div>
  );
}
