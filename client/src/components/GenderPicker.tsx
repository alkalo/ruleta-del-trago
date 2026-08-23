import { ALL_GENDERS, GENDER_LABELS, type Gender } from "@shared/types";
import { sounds } from "../utils/sounds";

interface Props {
  value: Gender | null;
  onChange: (gender: Gender) => void;
}

export default function GenderPicker({ value, onChange }: Props) {
  return (
    <>
      <label className="label">Tu género</label>
      <p className="muted">
        Sirve para emparejar retos (hetero, gay, lesbiana…). Elige el que encaje
        contigo.
      </p>
      <div className="chip-grid">
        {ALL_GENDERS.map((g) => (
          <button
            key={g}
            type="button"
            className={`chip ${value === g ? "selected" : ""}`}
            onClick={() => {
              sounds.click();
              onChange(g);
            }}
          >
            {GENDER_LABELS[g]}
          </button>
        ))}
      </div>
    </>
  );
}
