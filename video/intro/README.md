# MC intro video (어벤추수 땡스게임)

The 39.6 s opening the projector plays on step 2 of 진행 순서 (▶ 영상 시작). After it ends, the step's BGM takes over.

## Files
| File | What |
|---|---|
| `master/media/어벤추수-mc-intro-sfx.mp4` | **The one the show plays.** `-picture` + 41 sound effects. |
| `master/media/어벤추수-mc-intro-picture.mp4` | `-names-noglow` + the explosion when Thanos pushes Gamora (32.12 s). Made by `scripts/intro-picture.mjs`. |
| `master/media/어벤추수-mc-intro-names-noglow.mp4` | Stones renamed 믿음·소망·사랑·지혜·온유·은혜. No effects. The mix's input. |
| `master/media/어벤추수-mc-intro-names.mp4` | Same, plus a gold glow 35.75–36.45 s teasing the 7th stone. **Not used**: Austin wants 감사 a complete secret. |
| `master/media/어벤추수-mc-intro.mp4` | The first cut (stones 예배…행정). Kept as the original. |
| `video/intro/sfx/*.wav` | The effects (made with `earshot make`; recipe in `sfx-spec.json` + the named ids in `scripts/intro-sfx.mjs`). |
| `scripts/intro-picture.mjs` | The push explosion: white-hot flash, fireball from the hands (~1060, 390), shockwave rings, punch-in zoom + shake, colour split. Re-renders only 31.9–33.2 s (same 1189 frames). |
| `scripts/intro-sfx.mjs` | The cue table (time, effect, dB, pitch, what it's for) and the ffmpeg mix. |
| `scripts/make-boom-sfx.mjs` | The explosion layers (suck-in, blast, sub-drop), made with ffmpeg. |

`master/media/` is git-ignored: the videos live only on this PC (and must be uploaded from the console's 파일 올리기
for the Fly site). The source project of the video was deleted; changes to the picture are frame patches.

## The picture, second by second
0–9 s THANKSGIVING EVENT, "끝이 아니라, 감사로." · 9.6 flash, "6개의 스톤을 모아라" · stones pop at 9.9 / 10.5 /
11.15 / 11.85 / 12.5 / 13.2 · 13.5 gauntlet rises, stones fly in, 14.75 lock-in flash · team cards 15.5–20.5 (one per
second) · 21.5 "60명의 어벤져스, 집결." · 23.8 "오늘의 MC" · 24.0 Thanos (효준), 25.67 SNAP! · 27.45 Gamora (예진)
· 29.8 both on Titan, **32.12 push → explosion** (suck-in from 31.57, flash, fireball, rings, shake until ~32.8), 32.35 kick · 34.1 "THANOS & GAMORA 효준 · 예진" · 35.25–36.69 black ·
36.69 and 37.86 the two title stabs. 감사 (the 7th stone) never appears or sounds in the intro.

## Remaking the sound
```
node scripts/intro-picture.mjs                  # names-noglow.mp4 → picture.mp4 (the explosion)
node scripts/intro-sfx.mjs                      # picture.mp4 → sfx.mp4 (all the sound)
earshot timeline master/media/어벤추수-mc-intro-sfx.mp4    # check: effects on the cuts ("Sync to 24 cuts")
hear master/media/어벤추수-mc-intro-sfx.mp4 "describe what you hear, in order" --start 9.4 --end 13.6
```
Last check: 88% of cuts within 100 ms of a hit; true peak −1 dB; the only flagged cut (33.80) is a fade, with the
name slam 0.15 s later on purpose.
