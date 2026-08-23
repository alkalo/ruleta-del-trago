import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import RouletteWheel from "../components/RouletteWheel";
import PlayerList from "../components/PlayerList";
import DrunkCheckModal from "../components/DrunkCheckModal";
import StatsPanel from "../components/StatsPanel";
import ChallengeCard from "../components/ChallengeCard";
import HostChallengeEditor from "../components/HostChallengeEditor";
import type { GameMode } from "@shared/types";

export default function Game() {
  const { code } = useParams<{ code: string }>();
  const {
    room,
    isHost,
    playerId,
    lastSpinResult,
    beginSpin,
    completeSpin,
    updateDrunkLevels,
    finishDrunkCheck,
    markDrank,
    markCompleted,
    markSkipped,
  } = useSocket();

  const [localSpinning, setLocalSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [actedTargets, setActedTargets] = useState<Set<string>>(new Set());
  const [displayResult, setDisplayResult] = useState<typeof lastSpinResult>(null);

  const players = room?.players.filter((p) => p.connected) ?? [];
  const names = players.map((p) => p.name);

  useEffect(() => {
    if (lastSpinResult) {
      setDisplayResult(lastSpinResult);
      setActedTargets(new Set());
    }
  }, [lastSpinResult]);

  useEffect(() => {
    if (room?.sessionAlerts.length) {
      const last = room.sessionAlerts[room.sessionAlerts.length - 1];
      if (last.type === "fino") sounds.fino();
      else if (last.type === "warning") sounds.alert();
    }
  }, [room?.sessionAlerts.length]);

  const handleSpin = async () => {
    if (!isHost) return;
    sounds.click();
    setActedTargets(new Set());
    setDisplayResult(null);
    setWinnerIndex(null);

    try {
      const updatedRoom = await beginSpin();
      if (updatedRoom?.phase === "drunk_check") return;

      setLocalSpinning(true);
      const idx = Math.floor(Math.random() * names.length);
      setWinnerIndex(idx);
    } catch {
      alert("No se pudo girar");
    }
  };

  const onSpinComplete = useCallback(async () => {
    setLocalSpinning(false);
    if (!isHost) return;
    try {
      await completeSpin();
    } catch {
      alert("Error al completar giro");
    }
  }, [isHost, completeSpin]);

  const handleDrunkSubmit = async (updates: Record<string, number>) => {
    try {
      await updateDrunkLevels(updates);
      if (room?.phase === "drunk_check") {
        await finishDrunkCheck();
      }
    } catch {
      alert("Error al actualizar niveles");
    }
  };

  const handleAction = async (
    targetId: string,
    action: "drank" | "completed" | "skipped"
  ) => {
    if (playerId !== targetId) return;
    try {
      if (action === "drank") await markDrank();
      else if (action === "completed") await markCompleted();
      else await markSkipped();
      setActedTargets((prev) => new Set(prev).add(targetId));
    } catch {
      /* ignore */
    }
  };

  if (!room) {
    return (
      <div>
        <h1>Cargando sala…</h1>
        <p className="muted">Código: {code}</p>
      </div>
    );
  }

  const phase = room.phase;
  const targets = displayResult?.targets ?? room.currentTargets;
  const mode = (displayResult?.mode ?? room.currentMode) as GameMode | null;
  const challenge = displayResult?.challenge ?? room.currentChallenge;

  return (
    <div>
      <h1>Ruleta del Trago</h1>
      <p className="muted">
        Sala {room.code} · Ronda {room.round} · {players.length} jugadores
      </p>

      {room.sessionAlerts.slice(-3).map((a) => (
        <div
          key={a.id}
          className={`alert-banner alert-${a.type === "fino" ? "fino" : a.type === "warning" ? "warning" : "info"}`}
        >
          {a.message}
        </div>
      ))}

      {phase === "drunk_check" && (
        <DrunkCheckModal
          players={players}
          onSubmit={handleDrunkSubmit}
          roundLabel={`Pausa #${room.drunkCheckRound}`}
        />
      )}

      {(phase === "challenge" || phase === "spinning") && (
        <>
          <RouletteWheel
            names={names}
            spinning={localSpinning || phase === "spinning"}
            winnerIndex={isHost ? winnerIndex : null}
            onSpinComplete={isHost ? onSpinComplete : undefined}
          />

          {isHost && !localSpinning && phase !== "spinning" && (
            <button className="btn btn-primary" onClick={handleSpin}>
              🎰 GIRAR RULETA
            </button>
          )}

          {!isHost && phase === "spinning" && (
            <p className="muted" style={{ textAlign: "center" }}>
              La ruleta gira… no mires el móvil o miras más
            </p>
          )}

          {challenge && mode && displayResult && (
            <>
              {targets.map((tid) => {
                const player = players.find((p) => p.id === tid);
                if (!player) return null;
                return (
                  <div key={tid}>
                    <h2 style={{ color: "var(--yellow)" }}>
                      👉 {player.name}
                      {player.isFino && " (FINO)"}
                    </h2>
                    <ChallengeCard
                      challenge={challenge}
                      mode={mode}
                      displayText={
                        displayResult.displayTexts[tid] ?? challenge.text
                      }
                      drinkAmount={displayResult.drinkAmounts[tid]}
                      soberAlternative={
                        displayResult.soberAlternatives[tid]
                      }
                      drinksAlcohol={player.drinksAlcohol}
                      isTarget={playerId === tid}
                      onDrank={() => handleAction(tid, "drank")}
                      onCompleted={() => handleAction(tid, "completed")}
                      onSkipped={() => handleAction(tid, "skipped")}
                      acted={actedTargets.has(tid)}
                    />
                  </div>
                );
              })}
            </>
          )}

          {!displayResult && !localSpinning && phase === "challenge" && (
            <div className="card">
              <p className="muted">
                {isHost
                  ? "Pulsa GIRAR RULETA para empezar el caos."
                  : "Esperando al host…"}
              </p>
            </div>
          )}
        </>
      )}

      <StatsPanel players={players} />
      <PlayerList players={players} title="Estado" />

      {isHost && <HostChallengeEditor />}
    </div>
  );
}
