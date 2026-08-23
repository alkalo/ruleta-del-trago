import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import RouletteWheel from "../components/RouletteWheel";
import PlayerList from "../components/PlayerList";
import DrunkCheckModal from "../components/DrunkCheckModal";
import StatsPanel from "../components/StatsPanel";
import ChallengeCard from "../components/ChallengeCard";
import HostChallengeEditor from "../components/HostChallengeEditor";
import VictoryScreen from "../components/VictoryScreen";
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
    submitDrunkLevel,
    markDrank,
    markCompleted,
    markSkipped,
    continueGame,
  } = useSocket();

  const [localSpinning, setLocalSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);

  const players = room?.players.filter((p) => p.connected) ?? [];
  const names = players.map((p) => p.name);

  const spinDisplay = useMemo(() => {
    if (lastSpinResult) return lastSpinResult;
    if (room?.activeSpin) return room.activeSpin;
    return null;
  }, [lastSpinResult, room?.activeSpin]);

  const resolvedTargets = room?.resolvedTargets ?? [];
  const pendingTargets =
    spinDisplay?.targets?.filter((tid) => !resolvedTargets.includes(tid)) ?? [];

  const canSpin =
    isHost &&
    !localSpinning &&
    room?.phase === "challenge" &&
    pendingTargets.length === 0;

  useEffect(() => {
    if (room?.sessionAlerts.length) {
      const last = room.sessionAlerts[room.sessionAlerts.length - 1];
      if (last.type === "fino") sounds.fino();
      else if (last.type === "warning") sounds.alert();
    }
  }, [room?.sessionAlerts.length]);

  const handleSpin = async () => {
    if (!canSpin) return;
    sounds.click();
    setWinnerIndex(null);

    try {
      const updatedRoom = await beginSpin();
      if (updatedRoom?.phase === "drunk_check") return;

      setLocalSpinning(true);
      const idx = Math.floor(Math.random() * names.length);
      setWinnerIndex(idx);
    } catch {
      alert("Completa la ronda antes de girar otra vez");
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

  const handleDrunkSubmit = async (level: number) => {
    try {
      await submitDrunkLevel(level);
    } catch {
      alert("Error al confirmar nivel");
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
  const spin = spinDisplay;
  const targets = spin?.targets ?? room.currentTargets;
  const mode = (spin?.mode ?? room.currentMode) as GameMode | null;
  const challenge = spin?.challenge ?? room.currentChallenge;

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

      {phase === "ended" && (
        <VictoryScreen
          isHost={isHost}
          onContinue={async () => {
            try {
              await continueGame();
            } catch {
              alert("Solo el host puede continuar");
            }
          }}
        />
      )}

      {phase === "drunk_check" && (
        <DrunkCheckModal
          players={players}
          playerId={playerId}
          drunkCheckSubmitted={room.drunkCheckSubmitted}
          onSubmit={handleDrunkSubmit}
          roundLabel={
            room.round === 0
              ? "Antes de empezar — confirma tu nivel"
              : `Pausa #${room.drunkCheckRound}`
          }
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

          {isHost && (
            <>
              {canSpin ? (
                <button className="btn btn-primary" onClick={handleSpin}>
                  🎰 GIRAR RULETA
                </button>
              ) : (
                !localSpinning &&
                phase === "challenge" &&
                pendingTargets.length > 0 && (
                  <p className="muted" style={{ textAlign: "center" }}>
                    Esperando que marquen:{" "}
                    {pendingTargets
                      .map((tid) => players.find((p) => p.id === tid)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )
              )}
            </>
          )}

          {!isHost && phase === "spinning" && (
            <p className="muted" style={{ textAlign: "center" }}>
              La ruleta gira… no mires el móvil o miras más
            </p>
          )}

          {challenge && mode && spin && (
            <>
              {targets.map((tid) => {
                const player = players.find((p) => p.id === tid);
                if (!player) return null;
                const acted = resolvedTargets.includes(tid);
                return (
                  <div key={tid}>
                    <h2 style={{ color: "var(--yellow)" }}>
                      👉 {player.name}
                      {player.isFino && " (FINO)"}
                    </h2>
                    <ChallengeCard
                      challenge={challenge}
                      mode={mode}
                      displayText={spin.displayTexts[tid] ?? challenge.text}
                      drinkAmount={spin.drinkAmounts[tid]}
                      soberAlternative={spin.soberAlternatives[tid]}
                      drinksAlcohol={player.drinksAlcohol}
                      isTarget={playerId === tid}
                      onDrank={() => handleAction(tid, "drank")}
                      onCompleted={() => handleAction(tid, "completed")}
                      onSkipped={() => handleAction(tid, "skipped")}
                      acted={acted}
                    />
                  </div>
                );
              })}
            </>
          )}

          {!spin && !localSpinning && phase === "challenge" && (
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
