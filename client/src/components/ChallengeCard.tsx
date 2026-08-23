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
  const skipAmount = skipDrinkAmount ?? drinkAmount;
  const skipDiffers =
    skipAmount !== undefined &&
    drinkAmount !== undefined &&
    skipAmount !== drinkAmount;

  return (
    <div className="challenge-card">
      <span className="badge">{GAME_MODE_LABELS[mode]}</span>
      <span className="badge">{CHALLENGE_TYPE_LABELS[challenge.type]}</span>
      <p className="challenge-text">{displayText}</p>

      {drinksAlcohol && drinkAmount !== undefined && drinkAmount > 0 && (
        <p>
          🍺 {isTarget ? "Tú bebes" : "Bebe"}:{" "}
          <strong>{formatDrinkAmount(drinkAmount)}</strong>
          <span className="muted"> — adaptado a {whose} nivel</span>
        </p>
      )}

      {drinksAlcohol && skipDiffers && skipAmount !== undefined && (
        <p className="muted">
          Si no lo haces: {formatDrinkAmount(skipAmount)} (también adaptado)
        </p>
      )}

      {!drinksAlcohol && soberAlternative && (
        <p>
          🧃 Castigo sobrio: <strong>{soberAlternative}</strong>
        </p>
      )}

      {isTarget && !acted && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {drinksAlcohol && drinkAmount !== undefined && drinkAmount > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => {
                sounds.drink();
                onDrank();
              }}
            >
              He bebido 🍻
            </button>
          )}
          <button
            className="btn btn-cyan"
            onClick={() => {
              sounds.success();
              onCompleted();
            }}
          >
            Reto cumplido ✓
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              sounds.alert();
              onSkipped();
            }}
          >
            {drinksAlcohol && skipAmount !== undefined
              ? "No quiero / bebo penalización"
              : "No quiero / castigo sobrio"}
          </button>
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
