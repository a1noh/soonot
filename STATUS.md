---
status: active
updated: 2026-11-23
summary: 어벤추수 땡스게임 show runner; LIVE on Fly (d3d7981); 2 fixes undeployed; team's simulation feedback to build into the remote
---
## Where we left off
- 2026-11-22/23: **Team simulation feedback** (Austin pasted it) is written up as a colour-coded 진행순서 (추가 green,
  수정 orange, 논의 red, old struck through) for the team's Google Doc. NOT built into the app yet. Changes it asks for:
  - no 5분 추가 시간; instead a 5분 countdown screen from 5:55 PM, then 빙고 종료
  - NEW step after 빙고 시상: 게임 방식 · 우승 조건 설명, a slide with the key rules (+ 초콜릿 안내)
  - no timer during rule explanations; a round's timer starts only when the game itself starts
  - prize screens (빙고 1등, 최종 시상) hidden first, shown at the reveal
  - rounds by the team's names: 1 코끼리코 비행기 (10바퀴, BGM while spinning), 2 찬양 맞추기 (1초 → 2초, then
    ~5초 of the song), 3 4지선다 and 6 일심동체 (drum 120 BPM beat as BGM), 4 매의 눈, 5 휘트니 휴스턴 (song once,
    from 5 s); 타이브레이커 timer 20초; 구디백 안내 for everyone (placed at 감사합니다, to confirm)
  - still 논의: mid-game score updates, 코끼리코 20초 limit scope + team order method, BGM for the new rules step
- Run-of-show doc for the team (Claude Doc, one table): https://claude.ai/artifact/VmGQiiqrvXi5ZhZTV8pFaH (pre-feedback
  version). The colour-coded post-feedback page was a scratch HTML file; regenerate from the list above if needed.
- 2026-11-21 fixes on `feat/script-alignment`, pushed but **not deployed**: d7deb70 (projector fits fullscreen
  1920×1080 and 1024×768, podium fits, stones timer moved, no stale round timer), 38d70d0 (phone console menus fit).
- 2026-11-21: big session; committed (98fe5bd, d3d7981) and **deployed**: `main` fast-forwarded to d3d7981, CI + Fly
  deploy green, live site serves the same build. Media uploaded to the Fly volume with `scripts/upload-media.mjs`
  (intro video + 11 BGM tracks, all served). Live: https://soonot-hanmadang.fly.dev (/master · /p · /b · /rules).
- **진행 순서** is now a remote that runs the whole evening: 10 steps, 다음 ▶ does each step's next action
  (autopilot), ◀ 이전 mirrors it, the 스톤 rounds are one step driven by the game, ↺ 전체 초기화 restarts the evening
  on the same 참여 코드. Status-only game panels in the remote; full controls stay in the game tabs.
- 스톤: stones are 믿음·소망·사랑·지혜·온유·은혜; a secret 7th **감사 스톤** is the prize of a 1위 tie-breaker (only
  1위 ties get a 결정전; 순위 발표 is blocked until it's decided). Rewind (◀ per round) and BACK (reveal steps) added.
- Sound: projector effects (made with ffmpeg), BGM per step and per round (Kevin MacLeod, CC BY, credit shown 8 s),
  🔇 소리 끄기. Timers start by themselves on their step / round and end when you leave the step.
- Intro video: chocojitsu patched the stone names (no 7th-stone tease: 감사 stays a complete secret); this session mixed
  41 effects, plus a super-dramatic explosion (picture + sound) when Thanos pushes Gamora at 32.12 s →
  `master/media/어벤추수-mc-intro-sfx.mp4` (see `video/intro/README.md`). The show plays it on step 2.
- Bingo: 🤖 테스트 봇 button; at the reveal any of the top 3 cards can go on the projector with 랜덤 5명.
- Verified: 400 unit tests; `scripts/rehearse.mjs` (whole show, sound checks) and `scripts/rehearse-paths.mjs`
  (14 scenarios) all pass against a throwaway server on :3100.
- The local server (`npm start`, :3000) runs all of it; Austin rehearses there (event code PDSX).

## Next steps
1. Get the team's answers on the 논의 items and which round names show on screen; then build the feedback into
   `master/src/event/show.ts` (steps, `ROUNDS`, `MUSIC`), `autopilot.ts` (countdown, timer on game start, prize hidden)
   and `stones/src/shared/constants.ts` (game names, tiebreak timer); re-run both rehearsal scripts.
2. Ask Austin, then deploy (merge to `main`) d7deb70 + 38d70d0 + the feedback build; re-run `upload-media.mjs` if
   media changed (drum 120 BPM beat, 코끼리코 BGM are new media).
3. Before the event: create the event on the live /master, open /p on the projector laptop and tap it once for sound.
   After any change to the intro or music, re-run `scripts/upload-media.mjs` (media is not in git).
4. Austin to listen to the intro's effects and the 11 BGM picks (chosen by description, not by ear); swap tracks in
   ✎ 순서 편집 or `MUSIC` / `ROUNDS` in `master/src/event/show.ts`.
5. Optional: a "참가자 카드 보기" list for any bingo player (today only the top 3); `npm run verify` uses bash
   that fails on Windows (`set -o pipefail`), fix the script.

## Decisions
- One path: the remote is the only way forward (다음 ▶); game tabs are for emergencies.
- 결정전 only for a tie for 1위; other ties share their place.
- Stone names 믿음·소망·사랑·지혜·온유·은혜 + secret 감사 (Austin, 2026-11-21).
- Music must be free to play at an event: Kevin MacLeod (CC BY 4.0). TikTok's library can't be used outside TikTok.
  Hand-played songs (찬양 clips, 태양 「눈, 코, 입」, I Will Always Love You) stop the BGM on their round.
- Media work (video, sound) is done in this project with the hub toolbox, not handed to other sessions.
- `feat/script-alignment` stays unmerged until Austin approves (pushing `main` deploys live).
- Live site basics (unchanged): Fly app `soonot-hanmadang`, Tokyo, always-on (~$3/mo, `flyctl scale count 0` to pause);
  master passcode set by `MASTER_PASSCODE_HASH`; auto-deploy on green `main` (`DEPLOY_ENABLED=true`).
- 2026-11-22: The team gets the run of show as one flow, details per row (Claude Doc table; plain or colour-coded text for their Google Doc).
- 2026-11-23: Simulation feedback is the new spec for the show (see Where we left off); 5분 추가 시간 dropped.
