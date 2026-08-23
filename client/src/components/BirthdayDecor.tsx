import { BIRTHDAY_NAME } from "../constants/birthday";

const PENNANT_COLORS = [
  "var(--pink)",
  "var(--yellow)",
  "var(--cyan)",
  "var(--purple)",
];

const CONFETTI_COLORS = ["#fee440", "#00f5d4", "#ff006e", "#9d4edd", "#00bbf9"];

const BALLOONS = [
  { left: "1.5%", delay: "0s", hue: "#ff006e" },
  { left: "7%", delay: "1.1s", hue: "#fee440" },
  { left: "87%", delay: "0.5s", hue: "#00f5d4" },
  { left: "93%", delay: "1.7s", hue: "#9d4edd" },
];

export function BirthdayBanner() {
  return (
    <div className="birthday-banner" role="status">
      🎂 ¡Feliz cumpleaños, {BIRTHDAY_NAME}!
    </div>
  );
}

export default function BirthdayDecor() {
  return (
    <div className="birthday-layer" aria-hidden="true">
      <div className="birthday-bunting">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="birthday-pennant"
            style={{ background: PENNANT_COLORS[i % PENNANT_COLORS.length] }}
          />
        ))}
      </div>

      {BALLOONS.map((b, i) => (
        <div
          key={i}
          className="birthday-balloon"
          style={{ left: b.left, animationDelay: b.delay, color: b.hue }}
        >
          <span className="birthday-balloon-body" />
          <span className="birthday-balloon-string" />
        </div>
      ))}

      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          className="birthday-confetti-piece"
          style={{
            left: `${2 + ((i * 19) % 96)}%`,
            animationDelay: `${(i * 0.31) % 8}s`,
            animationDuration: `${7 + (i % 5)}s`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  );
}
