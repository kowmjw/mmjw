import { settings } from './storage';

// 用 Web Audio 现场合成的简单音效（方波、噪声），不需要音频文件。

let ac: AudioContext | null = null;

export function unlockAudio() {
  if (!ac) {
    try {
      ac = new AudioContext();
    } catch {
      return;
    }
  }
  if (ac.state === 'suspended') void ac.resume();
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; delay?: number } = {}) {
  if (!ac || !settings.sound) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const vol = opts.vol ?? 0.06;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.12, delay = 0) {
  if (!ac || !settings.sound) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(ac.destination);
  src.start(ac.currentTime + delay);
}

function arpeggio(freqs: number[], step: number, dur: number, vol = 0.05) {
  freqs.forEach((f, i) => tone(f, dur, { delay: i * step, vol }));
}

export const sfx = {
  cursor: () => tone(1320, 0.03, { vol: 0.025 }),
  ok: () => {
    tone(880, 0.05, { vol: 0.04 });
    tone(1320, 0.07, { vol: 0.04, delay: 0.05 });
  },
  cancel: () => tone(440, 0.08, { vol: 0.04, to: 300 }),
  step: () => tone(200, 0.02, { vol: 0.015, type: 'triangle' }),
  hit: () => {
    noise(0.12, 0.18);
    tone(160, 0.1, { vol: 0.06, to: 60 });
  },
  crit: () => {
    noise(0.2, 0.25);
    tone(220, 0.18, { vol: 0.08, to: 50 });
  },
  miss: () => tone(900, 0.12, { type: 'sine', vol: 0.04, to: 300 }),
  magic: () => arpeggio([523, 784, 1047, 1568], 0.03, 0.1, 0.035),
  heal: () => arpeggio([523, 659, 784, 1047], 0.07, 0.15),
  item: () => arpeggio([784, 988, 1175, 1568], 0.06, 0.12),
  levelUp: () => arpeggio([523, 659, 784, 1047, 1319], 0.08, 0.18),
  win: () => arpeggio([523, 523, 523, 698, 880, 1047], 0.12, 0.25),
  lose: () => arpeggio([392, 370, 349, 262], 0.22, 0.35),
  down: () => tone(300, 0.35, { vol: 0.06, to: 80 }),
};
