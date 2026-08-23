import { useEffect, useRef, useState } from "react";
import { sounds } from "../utils/sounds";

interface Props {
  names: string[];
  spinning: boolean;
  winnerIndex: number | null;
  onSpinComplete?: () => void;
}

interface SliceColor {
  fill: string;
  text: string;
}

const PALETTE: SliceColor[] = [
  { fill: "#9d4edd", text: "#ffffff" },
  { fill: "#ff006e", text: "#ffffff" },
  { fill: "#00e5c0", text: "#0a0014" },
  { fill: "#fee440", text: "#0a0014" },
  { fill: "#00bbf9", text: "#0a0014" },
  { fill: "#ff4d6d", text: "#ffffff" },
  { fill: "#06d6a0", text: "#0a0014" },
  { fill: "#c77dff", text: "#1a0030" },
  { fill: "#ff9e00", text: "#0a0014" },
  { fill: "#7b2cbf", text: "#ffffff" },
];

const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 199;
/** 12 o'clock in SVG (y-down, 0° = 3 o'clock, clockwise). */
const TOP_DEG = 270;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function polar(deg: number, radius = RADIUS): { x: number; y: number } {
  return {
    x: CX + radius * Math.cos(toRad(deg)),
    y: CY + radius * Math.sin(toRad(deg)),
  };
}

function slicePath(startDeg: number, endDeg: number): string {
  const a = polar(startDeg);
  const b = polar(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${a.x} ${a.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

function landingModulo(winnerIndex: number, count: number): number {
  const slice = 360 / count;
  const center = winnerIndex * slice + slice / 2;
  return ((-center) % 360 + 360) % 360;
}

function forwardDelta(from: number, toMod: number): number {
  const current = ((from % 360) + 360) % 360;
  let delta = toMod - current;
  if (delta < 0) delta += 360;
  return delta;
}

function fitName(name: string, maxChars: number): string {
  const trimmed = name.trim() || "Jugador";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`;
}

function labelLayout(count: number): { fontSize: number; maxChars: number; textR: number } {
  if (count <= 2) return { fontSize: 22, maxChars: 16, textR: RADIUS * 0.52 };
  if (count === 3) return { fontSize: 17, maxChars: 14, textR: RADIUS * 0.58 };
  if (count === 4) return { fontSize: 15, maxChars: 12, textR: RADIUS * 0.6 };
  if (count <= 6) return { fontSize: 13, maxChars: 10, textR: RADIUS * 0.64 };
  if (count <= 8) return { fontSize: 11, maxChars: 8, textR: RADIUS * 0.66 };
  return { fontSize: 10, maxChars: 7, textR: RADIUS * 0.68 };
}

function labelRotation(midDeg: number): number {
  let rot = midDeg + 90;
  rot = ((rot % 360) + 360) % 360;
  if (rot > 90 && rot < 270) rot += 180;
  return rot;
}

export default function RouletteWheel({
  names,
  spinning,
  winnerIndex,
  onSpinComplete,
}: Props) {
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const completeRef = useRef(onSpinComplete);
  completeRef.current = onSpinComplete;

  useEffect(() => {
    if (!spinning) return;
    if (names.length === 0) {
      completeRef.current?.();
      return;
    }

    const start = performance.now();
    const startRot = rotationRef.current;
    let raf = 0;
    sounds.spin();

    if (winnerIndex === null) {
      const tick = (now: number) => {
        const current = startRot + (now - start) * 0.55;
        rotationRef.current = current;
        setRotation(current);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    const count = names.length;
    const safeWinner =
      ((winnerIndex % count) + count) % count;
    const extraSpins = 5 + Math.random() * 3;
    const target =
      startRot +
      extraSpins * 360 +
      forwardDelta(startRot, landingModulo(safeWinner, count));
    const duration = 3500;
    let finished = false;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const current = startRot + (target - startRot) * eased;
      rotationRef.current = current;
      setRotation(current);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!finished) {
        finished = true;
        sounds.stop();
        completeRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning, winnerIndex, names.length]);

  if (names.length === 0) {
    return (
      <div className="roulette-container">
        <p className="muted">Sin jugadores…</p>
      </div>
    );
  }

  const count = names.length;
  const slice = 360 / count;
  const layout = labelLayout(count);
  const idleWinner =
    !spinning && winnerIndex !== null && winnerIndex >= 0 && winnerIndex < count
      ? winnerIndex
      : null;

  return (
    <div className="roulette-container">
      <div className="roulette-pointer" aria-hidden="true" />
      <div
        className="roulette-wheel"
        style={{ transform: `rotate(${rotation}deg)` }}
        role="img"
        aria-label={`Ruleta con ${count} sectores iguales: ${names.join(", ")}`}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {names.map((name, i) => {
            const startDeg = TOP_DEG + i * slice;
            const endDeg = startDeg + slice;
            const color = PALETTE[i % PALETTE.length];
            return (
              <g key={`slice-${i}-${name}`}>
                {count === 1 ? (
                  <circle cx={CX} cy={CY} r={RADIUS} fill={color.fill} />
                ) : (
                  <path d={slicePath(startDeg, endDeg)} fill={color.fill} />
                )}
              </g>
            );
          })}
          {count > 1 &&
            names.map((name, i) => {
              const startDeg = TOP_DEG + i * slice;
              const rim = polar(startDeg);
              return (
                <line
                  key={`div-${i}-${name}`}
                  x1={CX}
                  y1={CY}
                  x2={rim.x}
                  y2={rim.y}
                  stroke="rgba(10,0,20,0.4)"
                  strokeWidth="2.5"
                />
              );
            })}
          {names.map((name, i) => {
            const startDeg = TOP_DEG + i * slice;
            const midDeg = startDeg + slice / 2;
            const color = PALETTE[i % PALETTE.length];
            const label = fitName(name, layout.maxChars);
            const mid = polar(midDeg, layout.textR);
            const rot = count <= 2 ? 0 : labelRotation(midDeg);
            return (
              <text
                key={`label-${i}-${name}`}
                x={count === 1 ? CX : mid.x}
                y={count === 1 ? CY : mid.y}
                fill={color.text}
                fontSize={layout.fontSize}
                fontWeight={800}
                fontFamily="Inter, system-ui, sans-serif"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={
                  count === 1 ? undefined : `rotate(${rot} ${mid.x} ${mid.y})`
                }
                style={{ paintOrder: "stroke fill" }}
                stroke="rgba(0,0,0,0.28)"
                strokeWidth={2.4}
              >
                {label}
              </text>
            );
          })}
          {idleWinner !== null && count > 1 && (
            <path
              d={slicePath(
                TOP_DEG + idleWinner * slice,
                TOP_DEG + (idleWinner + 1) * slice
              )}
              fill="none"
              stroke="#fff8ff"
              strokeWidth="5"
            />
          )}
          <circle
            cx={CX}
            cy={CY}
            r={26}
            fill="#150028"
            stroke="#fee440"
            strokeWidth="5"
          />
        </svg>
      </div>
    </div>
  );
}
