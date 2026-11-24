/**
 * The 120 BPM drum beat (3라운드 4지선다, 6라운드 일심동체), made here from
 * tones and noise with ffmpeg: our own loop, so no licence and nothing to download.
 *
 *   node scripts/make-drum-beat.mjs        (needs ffmpeg on PATH)
 *
 * Writes master/media/bgm/drum-120-bpm.mp3 (git-ignored media, like the other BGM;
 * re-run scripts/upload-media.mjs for the live site). Kick on every beat
 * (four on the floor), snare on 2 and 4, hi-hat on every eighth note. 3 minutes, loops.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const OUT = 'master/media/bgm/drum-120-bpm.mp3';
const SECONDS = 180;
const PI2 = '2*PI';

// One beat = 0.5 s, one bar = 2 s.
const kickAt = (o) => {
  const t = `mod(t+${2 - o},2)`; // 0 at bar offset o
  // A falling sine (160 → 50 Hz) with a fast decay: a round kick drum.
  return `if(lt(${t},0.45),0.95*sin(${PI2}*(50*${t}+4.4*(1-exp(-25*${t}))))*exp(-7*${t}),0)`;
};
const kick = [kickAt(0), kickAt(0.5), kickAt(1), kickAt(1.5)].join('+');
const st = 'mod(t+0.5,1)'; // 0 on beats 2 and 4
const snare = `if(lt(${st},0.3),(0.42*(random(0)*2-1)*exp(-16*${st})+0.35*sin(${PI2}*185*${st})*exp(-22*${st})),0)`;
const ht = 'mod(t,0.25)';
const hat = `0.5*(random(1)*2-1)*exp(-55*${ht})`;

mkdirSync('master/media/bgm', { recursive: true });
execFileSync(
  'ffmpeg',
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-filter_complex',
    [
      `aevalsrc=exprs='${kick}+${snare}':s=44100:d=${SECONDS},lowpass=f=6000[body]`,
      `aevalsrc=exprs='${hat}':s=44100:d=${SECONDS},highpass=f=7000,volume=0.6[hats]`,
      `[body][hats]amix=inputs=2:normalize=0,aecho=0.8:0.3:40:0.15,loudnorm=I=-16:TP=-2,aformat=channel_layouts=stereo[out]`,
    ].join(';'),
    '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', OUT,
  ],
  { stdio: 'inherit' },
);
console.log(`✓ ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${SECONDS} s at 120 BPM)`);
