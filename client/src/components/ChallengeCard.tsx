import { formatDrinkAmount } from "@shared/gameLogic";
import { GAME_MODE_LABELS, CHALLENGE_TYPE_LABELS } from "@shared/types";
import type { Challenge, GameMode } from "@shared/types";
import { sounds } from "../utils/sounds";

interface Props {
  challenge: Challenge;
  mode: GameMode;
  displayText: string;
  drinkAmount?: number;
  skipDrinkAmount?: number;
  soberAlternative?: string;
  drinksAlcohol: boolean;
  isTarget: boolean;
  onDrank: () => void;
  onCompleted: () => void;
  onSkipped: () => void;
  acted: boolean;
}

export default function ChallengeCard({
  challenge,
  mode,
  displayText,
  drinkAmount,
  skipDrinkAmount,
  soberAlternative,
  drinksAlcohol,
  isTarget,
  onDrank,
  onCompleted,
  onSkipped,
  acted,
}: Props) {
  const whose = isTarget ? "tu" : "su";
  const isDrinkChallenge = challenge.type === "drink";
  const skipAmount = skipDrinkAmount ?? drinkAmount;
  const skipLabel =
    skipAmount !== undefined ? formatDrinkAmount(skipAmount) : "";

  return (
    <div className="challenge-card">
      <span className="badge">{GAME_MODE_LABELS[mode]}</span>
      <span className="badge">{CHALLENGE_TYPE_LABELS[challenge.type]}</span>
      <p className="challenge-text">{displayText}</p>

      {drinksAlcohol && isDrinkChallenge && drinkAmount !== undefined && drinkAmount > 0 && (
        <p>
          🍺 {isTarget ? "Te toca beber" : "Le toca beber"}:{" "}
          <strong>{formatDrinkAmount(drinkAmount)}</strong>
          <span className="muted"> — adaptado a {whose} nivel</span>
        </p>
      )}

      {drinksAlcohol && !isDrinkChallenge && skipAmount !== undefined && skipAmount > 0 && (
        <p>
          Si pasas, {isTarget ? "bebes" : "bebe"}:{" "}
          <strong>{skipLabel}</strong>
          <span className="muted"> — adaptado a {whose} nivel</span>
        </p>
      )}

      {!drinksAlcohol && soberAlternative && (
        <p>
          🧃 {isDrinkChallenge ? "En vez de beber" : "Si pasas"}:{" "}
          <strong>{soberAlternative}</strong>
        </p>
      )}

      {isTarget && !acted && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {isDrinkChallenge && drinksAlcohol && drinkAmount !== undefined && drinkAmount > 0 ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.drink();
                onDrank();
              }}
            >
              He bebido 🍻
            </button>
          ) : (
            <button
              className="btn btn-cyan"
              onClick={() => {
                sounds.success();
                onCompleted();
              }}
            >
              Lo hice ✓
            </button>
          )}
          {!isDrinkChallenge && (
            <button
              className="btn btn-danger"
              onClick={() => {
                sounds.alert();
                onSkipped();
              }}
            >
              {drinksAlcohol && skipLabel
                ? `Paso y bebo ${skipLabel}`
                : "Paso / hago el castigo"}
            </button>
          )}
        </div>
      )}

      {acted && (
        <p className="muted" style={{ textAlign: "center" }}>
          Listo. El host puede girar otra vez.
        </p>
      )}
    </div>
  );
}
