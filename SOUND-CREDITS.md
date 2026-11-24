# Sound credits

## Background music (진행 순서)

All tracks by **Kevin MacLeod** ([incompetech.com](https://incompetech.com)),
licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
`node scripts/fetch-music.mjs` downloads them into `master/media/bgm/` (not in git).
The projector shows the credit for 8 seconds whenever a track starts.

| Track | Step |
|---|---|
| Local Forecast - Elevator | 빙고 QR 안내 |
| Heroic Age | MC 등장 영상 (after the video) |
| Volatile Reaction | 빙고 종료 카운트다운 |
| Carefree | 빙고 1등 공개 |
| Five Armies | 어벤추수 땡스게임 메인 보드 |
| Monkeys Spinning Monkeys | 1라운드 · 코끼리코 비행기 (도는 동안) |
| Clash Defiant | 최종 집계 · 타이브레이커 |
| Life of Riley | 최종 시상 |
| Inspired | 감사합니다 |

Played by the MC by hand (commercial recordings, not bundled): the 찬양 clips (2라운드),
태양 「눈, 코, 입」 (4라운드), Whitney Houston 「I Will Always Love You」 (5라운드).
Those steps stop the background music.

The **드럼 120 BPM** beat (3라운드 4지선다, 6라운드 일심동체) is our own, synthesised by
`node scripts/make-drum-beat.mjs` (ffmpeg) into `master/media/bgm/drum-120-bpm.mp3`. No credit shown.

## Sound effects

`master/src/projector/sfx/*.mp3` are generated from tones and noise by
`node scripts/make-sfx.mjs` (ffmpeg). Original to this project; no third-party audio.

## Intro video

`어벤추수-mc-intro.mp4` (made for this event) uses an Avengers theme recorder-orchestra
cover chosen by the organiser. It is not in git.
