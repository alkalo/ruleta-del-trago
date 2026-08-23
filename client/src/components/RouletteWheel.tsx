import { useEffect, useRef, useState } from "react";
import { sounds } from "../utils/sounds";

interface Props {
  names: string[];
  spinning: boolean;
  winnerIndex: number | null;
  onSpinComplete?: () => void;
}

const COLORS = [
  "#9d4edd",
  "#ff006e",
  "#00f5d4",
  "#fee440",
  "#00bbf9",
  "#ff4d6d",
  "#06d6a0",
  "#c77dff",
];

export default function RouletteWheel({
  names,
  spinning,
  winnerIndex,
  onSpinComplete,
}: Props) {
  const [rotation, setRotation] = useState(0);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (!spinning || winnerIndex === null) return;

    sounds.spin();
    startRef.current = performance.now();
    const duration = 3500;
    const startRot = rotation;
    const extraSpins = 5 + Math.random() * 3;
    const segmentAngle = 360 / Math.max(names.length, 1);
    const targetIdx = winnerIndex ?? 0;
    const targetAngle =
      360 * extraSpins + (names.length - targetIdx) * segmentAngle - segmentAngle / 2;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startRot + targetAngle * eased;
      setRotation(current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        sounds.stop();
        onSpinComplete?.();
      }
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [spinning, winnerIndex]);

  if (names.length === 0) {
    return (
      <div className="roulette-container">
        <p className="muted">Sin jugadores…</p>
      </div>
    );
  }

  const segmentAngle = 360 / names.length;

  return (
    <div className="roulette-container">
      <div className="roulette-pointer" />
      <div
        className={`roulette-wheel ${spinning && winnerIndex === null ? "spinning-fast" : ""}`}
        style={{
          transform: winnerIndex !== null ? `rotate(${rotation}deg)` : undefined,
          background: `conic-gradient(${names
            .map(
              (_, i) =>
                `${COLORS[i % COLORS.length]} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`
            )
            .join(", ")})`,
        }}
      >
        {names.map((name, i) => (
          <div
            key={name + i}
            className="roulette-segment"
            style={{
              transform: `rotate(${i * segmentAngle}deg) skewY(-${90 - segmentAngle}deg)`,
              background: COLORS[i % COLORS.length],
            }}
          >
            <span
              style={{
                transform: `skewY(${90 - segmentAngle}deg) rotate(${segmentAngle / 2}deg)`,
                display: "block",
                maxWidth: 60,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
