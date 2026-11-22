/**
 * Sound effects for the MC intro video (어벤추수 땡스게임).
 *
 *   node scripts/intro-sfx.mjs [input.mp4] [output.mp4]
 *   (default: master/media/어벤추수-mc-intro-picture.mp4 → master/media/어벤추수-mc-intro-sfx.mp4;
 *    the picture file is made by scripts/intro-picture.mjs from -names-noglow.mp4)
 *   감사 (the 7th stone) is a complete secret: no glow, no sound for it in the intro.
 *
 * Every cue is one line below: when it plays (seconds), which effect
 * (video/intro/sfx/<name>.wav, made with `earshot make`, spec in video/intro/sfx-spec.json),
 * how loud (dB), and an optional pitch factor. Times come from the video's frames
 * and `earshot timeline` (cuts, the two title stabs at 36.69 and 37.86).
 * The video's own music stays; effects sit on top; the mix is levelled to -16 LUFS.
 */
import { execFileSync } from 'node:child_process';

const IN = process.argv[2] ?? 'master/media/어벤추수-mc-intro-picture.mp4';
const OUT = process.argv[3] ?? 'master/media/어벤추수-mc-intro-sfx.mp4';
const SFX = 'video/intro/sfx/';

/** [time s, effect, gain dB, pitch?, note] — `time` is when the sound STARTS (minus its own lead-in where noted). */
export const CUES = [
  [1.2, 'swell', -9, 1, 'THANKSGIVING EVENT fades in'],
  [4.3, 'deep-swell', -12, 1, '“끝이 아니라, 감사로.”'],
  [9.55, 'flash-hit', -3, 1, 'white flash → 6개의 스톤을 모아라'],
  [9.9, 'gem-pop', -6, 1.0, 'stone 1 · 믿음'],
  [10.5, 'gem-pop', -6, 1.06, 'stone 2 · 소망'],
  [11.15, 'gem-pop', -6, 1.12, 'stone 3 · 사랑'],
  [11.85, 'gem-pop', -6, 1.19, 'stone 4 · 지혜'],
  [12.5, 'gem-pop', -6, 1.26, 'stone 5 · 온유'],
  [13.2, 'gem-pop', -6, 1.33, 'stone 6 · 은혜'],
  [13.45, 'gauntlet-rise', -5, 1, 'the gauntlet rises'],
  [14.0, 'whoosh', -9, 1.0, 'stones fly in'],
  [14.2, 'whoosh', -9, 1.12, 'stones fly in'],
  [14.4, 'whoosh', -9, 1.25, 'stones fly in'],
  [14.7, 'power-lock', -4, 1, 'flash: the stones lock in (shimmer)'],
  [14.56, 'impact', -2, 1, 'flash: the stones lock in (hit peaks at +0.16 s)'],
  [15.45, 'card-swoosh', -5, 1, 'TEAM 01 아이언맨'],
  [16.45, 'card-swoosh', -5, 1.03, 'TEAM 02 헐크'],
  [17.45, 'card-swoosh', -5, 1.06, 'TEAM 03 캡틴 아메리카'],
  [18.45, 'card-swoosh', -5, 1.09, 'TEAM 04 토르'],
  [19.45, 'card-swoosh', -5, 1.12, 'TEAM 05 블랙 위도우'],
  [20.45, 'card-swoosh', -5, 1.15, 'TEAM 06 호크아이'],
  [21.45, 'assemble-boom', -2, 1, '60명의 어벤져스, 집결.'],
  [21.45, 'impact', -5, 1, '60명의 어벤져스, 집결. (body)'],
  [21.6, 'riser', -11, 1, 'build into 오늘의 MC'],
  [23.6, 'namecard', -6, 1, '오늘의 MC (slam peaks at +0.2 s)'],
  [23.85, 'villain', -3, 1, 'Thanos is lit (sting peaks at +0.65 s)'],
  [25.0, 'hit', -9, 1, 'purple pulse'],
  [25.62, 'snap', 0, 1, 'SNAP!'],
  [25.67, 'thunder', -7, 1, 'SNAP! thunder'],
  [27.0, 'blade-draw', -3, 1, 'Gamora’s green blade (draw peaks at +0.44 s)'],
  [29.75, 'impact', -9, 1, 'both on Titan'],
  [31.57, 'suck-in', -3, 1, 'air sucked in, ending on the hit'],
  [32.10, 'sub-drop', 0, 1, 'THE PUSH: sub drop'],
  [32.11, 'blast', -1, 1, 'THE PUSH: the explosion'],
  [32.12, 'punch', -3, 1, 'THE PUSH: the hit'],
  [32.12, 'title-boom', -5, 0.8, 'THE PUSH: a deeper boom under it'],
  [32.2, 'thunder', -10, 1, 'THE PUSH: rolling tail'],
  [32.35, 'kick', -4, 1, 'Gamora’s flying kick'],
  [33.9, 'namecard', -3, 1, 'THANOS & GAMORA · 효준 · 예진 (slam peaks at +0.2 s)'],
  [36.52, 'title-boom', -2, 1, 'title stab 1 · 어벤추수'],
  [37.69, 'title-boom', -1, 1, 'title stab 2 · 땡스게임'],
];

const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', IN];
for (const [, name] of CUES) args.push('-i', `${SFX}${name}.wav`);
const parts = CUES.map(([t, , db, pitch], i) => {
  const ms = Math.round(t * 1000);
  const shift = pitch !== 1 ? `asetrate=48000*${pitch},aresample=48000,` : '';
  return `[${i + 1}:a]aresample=48000,${shift}volume=${db}dB,adelay=${ms}|${ms}[s${i}]`;
});
const mix = `[0:a]aresample=48000[m];[m]${CUES.map((_, i) => `[s${i}]`).join('')}amix=inputs=${CUES.length + 1}:normalize=0:duration=first,alimiter=limit=0.89,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
args.push('-filter_complex', [...parts, mix].join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`${OUT}: ${CUES.length} effects mixed in`);
