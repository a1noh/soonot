/**
 * Picture effects for the MC intro: the explosion when Thanos pushes Gamora.
 *
 *   node scripts/intro-picture.mjs [input.mp4] [output.mp4]
 *   (default: master/media/어벤추수-mc-intro-names-noglow.mp4 → master/media/어벤추수-mc-intro-picture.mp4)
 *
 * Only 31.9–33.2 s is re-rendered (frames 957–995); everything else is the same
 * frames, so every cut keeps its time and scripts/intro-sfx.mjs still lines up.
 * At the hit (32.12 s, hands meeting at ~(1060, 390)): a white-hot flash, a
 * fireball blooming from the contact point, a shockwave ring racing outward, a
 * punch-in zoom with a hard camera shake that settles, and a short colour split.
 * Then run scripts/intro-sfx.mjs (it reads this file) for the sound.
 */
import { execFileSync } from 'node:child_process';

const IN = process.argv[2] ?? 'master/media/어벤추수-mc-intro-names-noglow.mp4';
const OUT = process.argv[3] ?? 'master/media/어벤추수-mc-intro-picture.mp4';

const FPS = 30;
const SEG_START = 31.9; // seconds: the re-rendered window
const SEG_END = 33.2;
const HIT = 32.12 - SEG_START; // the push, in the window's own time
const CX = 1060; // where their hands meet
const CY = 390;

const s0 = Math.round(SEG_START * FPS);
const s1 = Math.round(SEG_END * FPS);
const dt = `(T-${HIT})`; // time since the hit (layer clock)
const after = `gte(T,${HIT})`;

// The blast layer: a fireball (white core → orange → red edge) and a shockwave ring, both fading.
const D = `hypot(X-${CX},Y-${CY})`;
const R = `(70+1100*${dt})`; // fireball radius grows
const fire = `${after}*exp(-2.6*${dt})*exp(-pow(${D},2)/(2*pow(${R},2)))`;
const ring = `${after}*exp(-2.2*${dt})*exp(-pow(${D}-2300*${dt},2)/(2*pow(28+60*${dt},2)))`;
const A = `clip(255*max(1.15*${fire},0.95*${ring}),0,255)`;
const core = `exp(-${D}/(${R}*0.45))`;
const layer =
  `color=c=black@0:s=1920x1080:r=${FPS}:d=${(SEG_END - SEG_START).toFixed(3)},format=rgba,` +
  `geq=r='255':g='clip(110+145*${core},0,255)':b='clip(40+215*pow(${core},2),0,255)':a='${A}'[blast]`;

// The camera: punch-in zoom and a hard shake that settles, both from the hit (video clock t).
const since = `(t-${HIT})`;
const Z = `if(gte(t,${HIT}),0.16*exp(-5*${since}),0)`;
const SX = `if(gte(t,${HIT}),34*exp(-5.5*${since})*sin(95*${since}),0)`;
const SY = `if(gte(t,${HIT}),26*exp(-5.5*${since})*cos(83*${since}),0)`;
const flash = `if(between(t,${HIT},${HIT + 0.16}),0.55*(1-(t-${HIT})/0.16),0)`;
const sat = `if(between(t,${HIT},${HIT + 0.7}),1+0.6*exp(-4*(t-${HIT})),1)`;

const mid =
  `[0:v]trim=start_frame=${s0}:end_frame=${s1},setpts=PTS-STARTPTS[m0];` +
  `${layer};` +
  `[m0][blast]overlay=shortest=1:format=auto[m1];` +
  `[m1]eq=brightness='${flash}':saturation='${sat}':eval=frame[m2];` +
  `[m2]scale=w='2*trunc(1920*(1+${Z})/2+${0.5})':h='2*trunc(1080*(1+${Z})/2+${0.5})':eval=frame,` +
  `crop=1920:1080:x='(iw-1920)/2+${SX}':y='(ih-1080)/2+${SY}',` +
  `rgbashift=rh=-14:bh=14:enable='between(t,${HIT},${HIT + 0.2})',setsar=1[mid]`;
const graph =
  `[0:v]trim=end_frame=${s0},setpts=PTS-STARTPTS[a];` +
  mid +
  `;[0:v]trim=start_frame=${s1},setpts=PTS-STARTPTS[c];` +
  `[a][mid][c]concat=n=3:v=1:a=0,format=yuv420p[v]`;

execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error', '-i', IN,
  '-filter_complex', graph, '-map', '[v]', '-map', '0:a', '-c:a', 'copy',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', String(FPS), '-movflags', '+faststart', OUT,
], { stdio: 'inherit' });
console.log(`${OUT}: explosion at ${(SEG_START + HIT).toFixed(2)} s`);
