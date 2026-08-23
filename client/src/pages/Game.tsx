import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import RouletteWheel from "../components/RouletteWheel";
import PlayerList from "../components/PlayerList";
import DrunkCheckModal from "../components/DrunkCheckModal";
import StatsPanel from "../components/StatsPanel";
import ChallengeCard from "../components/ChallengeCard";
import VictoryScreen from "../components/VictoryScreen";
import RoomLoadError from "../components/RoomLoadError";
import { useRoomRejoin } from "../hooks/useRoomRejoin";
import type { GameMode } from "@shared/types";
import { BIRTHDAY_NAME, isBirthdayName } from "../constants/birthday";

export default function Game() {
  const { code } = useParams<{ code: string }>();
  const { loadError } = useRoomRejoin(code);
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
    hostMarkDrank,
    hostMarkCompleted,
    hostMarkSkipped,
    clientKey,
  } = useSocket();

  const [localSpinning, setLocalSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [iStartedSpin, setIStartedSpin] = useState(false);
  const completeOnceRef = useRef(false);

  const allPlayers = room?.players ?? [];
  const players = allPlayers.filter((p) => p.connected);
  const spinNames =
    room &&
    room.spinPlayerIds.length > 0 &&
    (room.phase === "spinning" || localSpinning)
      ? room.spinPlayerIds
          .map((id) => room.players.find((p) => p.id === id)?.name)
          .filter((n): n is string => Boolean(n))
      : [];
  const names = spinNames.length > 0 ? spinNames : players.map((p) => p.name);

  const spinDisplay = useMemo(() => {
    if (room?.phase === "spinning" || localSpinning) {
      return room?.activeSpin ?? null;
    }
    if (room?.activeSpin) return room.activeSpin;
    if (lastSpinResult) return lastSpinResult;
    return null;
  }, [lastSpinResult, localSpinning, room?.activeSpin, room?.phase]);

  const resolvedTargets = room?.resolvedTargets ?? [];
  const pendingTargets =
    (room?.activeSpin?.targets ?? room?.currentTargets ?? []).filter(
      (tid) =>
        !resolvedTargets.includes(tid) &&
        (room?.players.some((p) => p.id === tid) ?? false)
    );

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

  useEffect(() => {
    if (room?.phase !== "spinning") {
      setLocalSpinning(false);
      setIStartedSpin(false);
      completeOnceRef.current = false;
    }
  }, [room?.phase]);

  useEffect(() => {
    if (!isHost || room?.phase !== "spinning") return;
    const t = window.setTimeout(() => {
      if (completeOnceRef.current) return;
      completeOnceRef.current = true;
      void completeSpin().catch(() => {
        completeOnceRef.current = false;
      });
    }, iStartedSpin ? 8000 : 1500);
    return () => window.clearTimeout(t);
  }, [isHost, room?.phase, completeSpin, iStartedSpin]);

  const handleSpin = async () => {
    if (!canSpin) return;
    sounds.click();
    setWinnerIndex(null);
    completeOnceRef.current = false;
    setIStartedSpin(true);

    try {
      const updatedRoom = await beginSpin();
      if (updatedRoom?.phase === "drunk_check") {
        setIStartedSpin(false);
        setLocalSpinning(false);
        return;
      }

      const wheelNames =
        updatedRoom.spinPlayerIds.length > 0
          ? updatedRoom.spinPlayerIds
              .map((id) => updatedRoom.players.find((p) => p.id === id)?.name)
              .filter((n): n is string => Boolean(n))
          : updatedRoom.players
              .filter((p) => p.connected)
              .map((p) => p.name);

      if (wheelNames.length === 0) {
        setIStartedSpin(true);
        setLocalSpinning(false);
        completeOnceRef.current = true;
        try {
          await completeSpin();
        } catch (e) {
          completeOnceRef.current = false;
          throw e;
        } finally {
          setIStartedSpin(false);
        }
        return;
      }

      setIStartedSpin(true);
      setLocalSpinning(true);
      setWinnerIndex(Math.floor(Math.random() * wheelNames.length));
    } catch (e) {
      setIStartedSpin(false);
      setLocalSpinning(false);
      alert(e instanceof Error ? e.message : "No se pudo girar");
    }
  };

  const onSpinComplete = useCallback(async () => {
    setLocalSpinning(false);
    if (!iStartedSpin && !isHost) return;
    if (completeOnceRef.current) return;
    completeOnceRef.current = true;
    try {
      await completeSpin();
    } catch (e) {
      completeOnceRef.current = false;
      alert(e instanceof Error ? e.message : "Error al completar giro");
    } finally {
      setIStartedSpin(false);
    }
  }, [iStartedSpin, isHost, completeSpin]);

  const handleDrunkSubmit = async (level: number) => {
    try {
      await submitDrunkLevel(level);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al confirmar nivel");
    }
  };

  const handleAction = async (
    targetId: string,
    action: "drank" | "completed" | "skipped"
  ) => {
    const asHost = isHost && playerId !== targetId;
    if (playerId !== targetId && !asHost) return;
    try {
      if (asHost) {
        if (action === "drank") await hostMarkDrank(targetId);
        else if (action === "completed") await hostMarkCompleted(targetId);
        else await hostMarkSkipped(targetId);
        return;
      }
      if (action === "drank") await markDrank();
      else if (action === "completed") await markCompleted();
      else await markSkipped();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo marcar el reto");
    }
  };

  if (loadError) {
    return <RoomLoadError error={loadError} code={code} />;
  }

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
            } catch (e) {
              alert(e instanceof Error ? e.message : "Solo el host puede continuar");
            }
          }}
        />
      )}

      {phase === "drunk_check" && (
        <DrunkCheckModal
          players={allPlayers}
          playerId={playerId}
          clientKey={clientKey}
          isHost={isHost}
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
            winnerIndex={iStartedSpin || isHost ? winnerIndex : null}
            onSpinComplete={
              iStartedSpin || isHost ? onSpinComplete : undefined
            }
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
                      .map((tid) => allPlayers.find((p) => p.id === tid)?.name)
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

          {challenge && mode && (spin || targets.length > 0) && (
            <>
              {targets.length > 1 && (
                <p className="muted" style={{ textAlign: "center" }}>
                  Cada uno bebe según SU nivel (el de la última pausa).
                </p>
              )}
              {targets.map((tid) => {
                const player = allPlayers.find((p) => p.id === tid);
                if (!player) return null;
                const acted = resolvedTargets.includes(tid);
                const hostCanResolve =
                  isHost && playerId !== tid && !acted;
                return (
                  <div key={tid}>
                    <h2 style={{ color: "var(--yellow)" }}>
                      👉 {player.name}
                      {player.isFino && " (FINO)"}
                      {isBirthdayName(player.name) && " 🎂"}
                      {!player.connected && " (sin conexión)"}
                    </h2>
                    {isBirthdayName(player.name) && (
                      <div className="alert-banner birthday-spin-toast">
                        🎉 ¡Feliz cumpleaños, {BIRTHDAY_NAME}! La ruleta te
                        eligió en tu noche. Que el caos sea legendario.
                      </div>
                    )}
                    <ChallengeCard
                      challenge={challenge}
                      mode={mode}
                      displayText={spin?.displayTexts?.[tid] ?? challenge.text}
                      drinkAmount={spin?.drinkAmounts?.[tid]}
                      skipDrinkAmount={spin?.skipDrinkAmounts?.[tid]}
                      soberAlternative={spin?.soberAlternatives?.[tid]}
                      drinksAlcohol={player.drinksAlcohol}
                      isTarget={playerId === tid}
                      onDrank={() => handleAction(tid, "drank")}
                      onCompleted={() => handleAction(tid, "completed")}
                      onSkipped={() => handleAction(tid, "skipped")}
                      acted={acted}
                    />
                    {hostCanResolve && !player.connected && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        <p className="muted" style={{ textAlign: "center" }}>
                          Sin conexión. El host puede cerrar su ronda:
                        </p>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleAction(tid, "drank")}
                        >
                          Marcar bebido por {player.name}
                        </button>
                        <button
                          className="btn btn-cyan"
                          onClick={() => handleAction(tid, "completed")}
                        >
                          Marcar cumplido por {player.name}
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleAction(tid, "skipped")}
                        >
                          Marcar skip por {player.name}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {!spin && !challenge && !localSpinning && phase === "challenge" && (
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
    </div>
  );
}
