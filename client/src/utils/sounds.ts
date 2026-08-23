let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15
) {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.stop(ac.currentTime + duration);
  } catch {
    /* audio optional */
  }
}

export const sounds = {
  click: () => tone(800, 0.05, "square", 0.08),
  spin: () => {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => tone(200 + i * 80, 0.04, "sawtooth", 0.06), i * 40);
    }
  },
  stop: () => {
    tone(440, 0.15, "square", 0.12);
    setTimeout(() => tone(660, 0.2, "square", 0.12), 100);
  },
  alert: () => {
    tone(300, 0.1, "sawtooth", 0.1);
    setTimeout(() => tone(500, 0.15, "sawtooth", 0.1), 120);
  },
  drink: () => tone(150, 0.3, "triangle", 0.15),
  success: () => {
    tone(523, 0.1, "sine", 0.1);
    setTimeout(() => tone(784, 0.15, "sine", 0.1), 80);
  },
  fino: () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => tone(400 + i * 100, 0.08, "square", 0.1), i * 60);
    }
  },
};
