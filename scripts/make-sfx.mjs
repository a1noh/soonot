/**
 * The projector's sound effects, made here from tones and noise with ffmpeg —
 * our own sounds, so there is no licence to track and nothing to download.
 *
 *   node scripts/make-sfx.mjs        (needs ffmpeg on PATH)
 *
 * Writes master/src/projector/sfx/*.mp3 (small, committed, bundled by Vite).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const OUT = 'master/src/projector/sfx/';
mkdirSync(OUT, { recursive: true });
const PI2 = '2*PI';

/** A tone from `s` for `d` seconds: harmonics (amplitude list), attack, exponential decay. */
function note(f, s, d, { amp = 0.3, harm = [1], decay = 4, attack = 0.01 } = {}) {
  const tt = `(t-${s})`;
  const wave = harm.map((a, k) => `${a}*sin(${PI2}*${f * (k + 1)}*${tt})`).join('+');
  const env = `min(1,${tt}/${attack})*exp(-${decay}*${tt})`;
  return `if(between(t,${s},${s + d}),${amp}*(${wave})*${env},0)`;
}
const sum = (parts) => parts.join('+');
const BRASS = [1, 0.6, 0.45, 0.3, 0.2, 0.12]; // a bright, brassy stack
const BELL = [1, 0, 0.35, 0, 0.15];

const SOUNDS = {
  // A stone is picked: a rising shimmer.
  reveal: {
    dur: 1.4,
    expr: sum([
      `0.22*sin(${PI2}*(380*t+520*t*t))*min(1,t*6)*exp(-1.8*t)`,
      ...[0, 0.12, 0.24, 0.36, 0.5].map((s, i) => note([1568, 1976, 2349, 2637, 3136][i], s, 0.9, { amp: 0.12, harm: BELL, decay: 6 })),
    ]),
    af: 'highpass=f=200,aecho=0.8:0.6:60:0.25',
  },
  // A stone is won: a bright major arpeggio.
  win: {
    dur: 1.6,
    expr: sum([523.25, 659.25, 783.99, 1046.5].map((f, i) => note(f, i * 0.09, 1.4, { amp: 0.22, harm: BELL, decay: 3.2 }))),
    af: 'aecho=0.8:0.5:45:0.2',
  },
  // A bingo somewhere in the room: a double bell.
  ding: {
    dur: 1.8,
    expr: sum([note(1318.5, 0, 1.6, { amp: 0.3, harm: [1, 0.5, 0.25], decay: 3 }), note(1760, 0.16, 1.6, { amp: 0.26, harm: [1, 0.5, 0.25], decay: 3 })]),
  },
  // The last five seconds of a timer.
  tick: { dur: 0.12, expr: note(1900, 0, 0.12, { amp: 0.5, harm: [1, 0.3], decay: 45, attack: 0.002 }) },
  // 시간 종료!
  buzzer: {
    dur: 1.0,
    expr: `0.35*(sin(${PI2}*196*t)+0.6*sin(${PI2}*392*t)+0.4*sin(${PI2}*588*t)+0.25*sin(${PI2}*784*t))*min(1,t*40)*if(lt(t,0.85),1,max(0,(1-t)/0.15))`,
    af: 'lowpass=f=2500',
  },
  // The 1위 tie-breaker appears: a deep cinematic hit.
  boom: {
    dur: 2.4,
    expr: `0.9*sin(${PI2}*(95*t-22*t*t))*exp(-1.9*t)+0.35*(random(1)*2-1)*exp(-14*t)`,
    af: 'lowpass=f=900,aecho=0.8:0.7:90:0.3',
  },
  // The podium: a snare roll building up, then a cymbal.
  drumroll: {
    dur: 3.4,
    expr: `if(lt(t,2.6),(random(2)*2-1)*pow(0.5+0.5*sin(${PI2}*30*t),6)*(0.15+0.55*t/2.6),0)+if(gte(t,2.6),0.6*(random(3)*2-1)*exp(-2.6*(t-2.6)),0)`,
    af: 'highpass=f=700,lowpass=f=9000',
  },
  // Each place revealed: ta-da-da-DAA.
  fanfare: {
    dur: 2.4,
    expr: sum([
      note(392, 0, 0.16, { amp: 0.16, harm: BRASS, decay: 2 }),
      note(392, 0.18, 0.16, { amp: 0.16, harm: BRASS, decay: 2 }),
      note(392, 0.36, 0.16, { amp: 0.16, harm: BRASS, decay: 2 }),
      note(523.25, 0.55, 1.8, { amp: 0.16, harm: BRASS, decay: 1.2 }),
      note(659.25, 0.55, 1.8, { amp: 0.12, harm: BRASS, decay: 1.2 }),
      note(783.99, 0.55, 1.8, { amp: 0.12, harm: BRASS, decay: 1.2 }),
    ]),
    af: 'lowpass=f=5000,aecho=0.8:0.6:70:0.3',
  },
  // A place is called (순위 발표): 빠-밤! — a short brass stab, then a big chord on a timpani hit.
  bam: {
    dur: 2.2,
    expr: sum([
      note(261.63, 0, 0.14, { amp: 0.2, harm: BRASS, decay: 6 }),
      note(392, 0, 0.14, { amp: 0.15, harm: BRASS, decay: 6 }),
      note(261.63, 0.2, 2, { amp: 0.2, harm: BRASS, decay: 1.6 }),
      note(329.63, 0.2, 2, { amp: 0.15, harm: BRASS, decay: 1.6 }),
      note(392, 0.2, 2, { amp: 0.15, harm: BRASS, decay: 1.6 }),
      note(523.25, 0.2, 2, { amp: 0.12, harm: BRASS, decay: 1.6 }),
      `if(gte(t,0.2),0.7*sin(${PI2}*(70*(t-0.2)-8*(t-0.2)*(t-0.2)))*exp(-3.2*(t-0.2)),0)`,
      `if(gte(t,0.2),0.18*(random(4)*2-1)*exp(-5*(t-0.2)),0)`,
    ]),
    af: 'lowpass=f=6000,aecho=0.8:0.6:80:0.3',
  },
};

// `node scripts/make-sfx.mjs bam` makes only the named effects (the others stay byte-for-byte).
const only = process.argv.slice(2);
for (const [name, s] of Object.entries(SOUNDS).filter(([n]) => only.length === 0 || only.includes(n))) {
  const out = `${OUT}${name}.mp3`;
  const filters = [s.af, 'loudnorm=I=-16:TP=-1.5:LRA=11', 'afade=t=out:st=' + Math.max(0, s.dur - 0.08) + ':d=0.08'].filter(Boolean).join(',');
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    // Quoted: the formula's commas would otherwise split the filter options.
    '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=44100:d=${s.dur}`,
    '-af', filters, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', out,
  ]);
  console.log(`${name.padEnd(9)} ${(statSync(out).size / 1024).toFixed(1)} KB`);
}
