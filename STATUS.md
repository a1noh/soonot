---
status: active
updated: 2026-11-21
summary: 어벤추수 땡스게임 show runner (bingo + 스톤 + 진행 순서 remote, intro video, sound); rehearsed end to end; not committed yet
---
## Where we left off
- 2026-11-21: big session on branch `feat/script-alignment` (13 commits ahead of `main`; today's work is **uncommitted**).
  The live site (soonot-hanmadang.fly.dev) still runs `main`; nothing from today is deployed.
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
1. **Commit** today's work on `feat/script-alignment` (Austin hasn't said yes yet), then push the branch.
2. Austin to listen to the intro's effects and the 11 BGM picks (chosen by description, not by ear); swap tracks in
   ✎ 순서 편집 or `MUSIC` / `ROUNDS` in `master/src/event/show.ts`.
3. Before the event on Fly: merge to `main` (ask first: it deploys), upload the intro video and run
   `scripts/fetch-music.mjs` on the machine (or upload the tracks), `/media` lives on the 1 GB volume.
4. Optional: a "참가자 카드 보기" list for any bingo player (today only the top 3); `npm run verify` uses bash
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
