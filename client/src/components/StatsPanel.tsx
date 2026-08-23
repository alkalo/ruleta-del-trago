import type { Player } from "@shared/types";

interface Props {
  players: Player[];
}

export default function StatsPanel({ players }: Props) {
  const sorted = [...players].sort(
    (a, b) => b.stats.drinksTaken - a.stats.drinksTaken
  );
  const mvp = sorted[0];

  return (
    <div className="card">
      <h3>📊 Stats de sesión</h3>
      {mvp && mvp.stats.drinksTaken > 0 && (
        <p className="muted">
          MVP del caos: <strong>{mvp.name}</strong> ({mvp.stats.drinksTaken} tragos)
        </p>
      )}
      <div className="stats-grid">
        {players.map((p) => (
          <div key={p.id} className="stat-box">
            <div className="stat-value">{p.drunkLevel}</div>
            <div className="stat-label">{p.name} borracho</div>
            <div className="muted" style={{ fontSize: "0.65rem" }}>
              🍺{p.stats.drinksTaken} · 🎯{p.stats.timesSelected} · ✓
              {p.stats.challengesCompleted}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
