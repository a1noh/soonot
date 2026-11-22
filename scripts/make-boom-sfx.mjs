/**
 * The explosion sound for the Thanos push (MC intro, 32.12 s), made from tones and noise with ffmpeg:
 *   suck-in.wav  — 0.55 s of rushing air sucked inward, ending exactly at the hit
 *   blast.wav    — the fiery body: a noise burst through a falling lowpass, with crackle
 *   sub-drop.wav — a deep sine drop from 90 Hz to 28 Hz, the chest-thump under it all
 *
 *   node scripts/make-boom-sfx.mjs      → video/intro/sfx/
 */
import { execFileSync } from 'node:child_process';

const OUT = 'video/intro/sfx/';
const SOUNDS = {
  'suck-in': {
    dur: 0.55,
    expr: `(random(4)*2-1)*pow(t/0.55,3)`,
    af: 'highpass=f=600,lowpass=f=7000,areverse,areverse',
  },
  blast: {
    dur: 2.8,
    expr: `(random(5)*2-1)*exp(-1.6*t)*(0.7+0.3*sin(2*PI*7*t))+0.5*(random(6)*2-1)*gt(random(7),0.985)*exp(-1.2*t)`,
    af: 'lowpass=f=4000,lowpass=f=1800,aecho=0.8:0.6:120|260:0.35|0.2',
  },
  'sub-drop': {
    dur: 2.2,
    expr: `sin(2*PI*(90*t-15.5*t*t))*exp(-1.4*t)*min(1,t*60)`,
    af: 'lowpass=f=220',
  },
};
for (const [name, s] of Object.entries(SOUNDS)) {
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=48000:d=${s.dur}`,
    '-af', `${s.af},loudnorm=I=-14:TP=-1:LRA=11,afade=t=out:st=${Math.max(0, s.dur - 0.08)}:d=0.08`,
    '-ac', '2', '-ar', '48000', `${OUT}${name}.wav`,
  ]);
  console.log(`${name}.wav`);
}
