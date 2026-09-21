/**
 * Multi-user, cross-game, real-socket simulations — the "play it end to end with
 * several people, through the master, and skip time" tests (req-matrix D).
 *
 * These drive the real host in-process with 3–5 client sockets and a
 * controllable clock, exercising what the per-game engine tests cannot: unicast
 * privacy at scale, reconnect, the shared reveal's exclusivity and projector
 * seize, per-game action isolation, and 윷놀이's time-expiry end.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CELLS } from '@soonot/bingo/src/shared/constants';
import { MS_PER_MIN } from '@soonot/yutnori/src/shared/constants';
import { boot, type Harness } from './e2e-harness.js';

const TRAITS = Array.from({ length: CELLS }, (_, i) => `특징${i + 1}`);
let h: Harness;
afterEach(async () => {
  await h?.cleanup();
});

async function openBingo(m: import('socket.io-client').Socket) {
  expect((await h.send(m, 'event:create', { title: '한마당' })).ok).toBe(true);
  expect((await h.send(m, 'master:setTraits', { gameId: 'bingo', texts: TRAITS })).ok).toBe(true);
}

describe('bingo — multiple users through real sockets', () => {
  it('5 players join with distinct numbers; a fill result is unicast, never leaked (req §16.2)', async () => {
    h = await boot();
    const m = await h.masterSocket();
    await openBingo(m);

    const ps: import('socket.io-client').Socket[] = [];
    const numbers = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const p = await h.playerSocket();
      const dealt = h.once(p, 'card:assigned', 5000).catch(() => null);
      const ack = await h.send(p, 'room:join', { nickname: `사람${i + 1}` });
      expect(ack.ok).toBe(true);
      ps.push(p);
      void dealt;
    }
    const dealtAll = Promise.all(ps.map((p) => h.once(p, 'card:assigned')));
    expect((await h.send(m, 'master:start', { gameId: 'bingo' })).ok).toBe(true);
    for (const c of await dealtAll) numbers.add(c.number);
    expect(numbers.size).toBe(5); // distinct, sequential numbers (req §7.0)

    // Player 0 fills a cell; only player 0 may see the cell:result (req §16.2).
    let leaked = 0;
    for (let i = 1; i < 5; i++) ps[i]!.on('cell:result', () => leaked++);
    const mine: unknown[] = [];
    ps[0]!.on('cell:result', (d) => mine.push(d));
    const targetNumber = [...numbers].find((n) => n !== [...numbers][0]); // someone else
    await h.send(ps[0]!, 'cell:fill', { cellIndex: 0, query: String(targetNumber) });
    await new Promise((r) => setTimeout(r, 150));
    expect(mine).toHaveLength(1);
    expect(leaked).toBe(0);
  });

  it('an ambiguous nickname returns candidates, and a reconnect restores the card + fills', async () => {
    h = await boot();
    const m = await h.masterSocket();
    await openBingo(m);

    // Two 민수 and a filler, so a name query is ambiguous (req §7.0).
    const a = await h.playerSocket();
    let permA: number[] = [];
    a.once('card:assigned', (d: { permutation: number[] }) => {
      permA = d.permutation;
    });
    const idA = (await h.send(a, 'room:join', { nickname: '민수' })).playerId;
    const b = await h.playerSocket();
    await h.send(b, 'room:join', { nickname: '민수' });
    const c = await h.playerSocket();
    await h.send(c, 'room:join', { nickname: '지은' });
    await h.send(m, 'master:start', { gameId: 'bingo' });
    await new Promise((r) => setTimeout(r, 100)); // let the deal arrive
    expect(permA).toHaveLength(CELLS);

    const cand = h.once(c, 'cell:candidates');
    await h.send(c, 'cell:fill', { cellIndex: 0, query: '민수' });
    const list = (await cand).candidates;
    expect(list).toHaveLength(2); // both 민수
    await h.send(c, 'cell:fillResolved', { cellIndex: 0, targetId: list[0].playerId });

    // Reconnect A itself: same deterministic card comes back (req §6, §13).
    a.close();
    await new Promise((r) => setTimeout(r, 80));
    const a2 = await h.playerSocket();
    const restore = h.once(a2, 'card:restore');
    expect((await h.send(a2, 'room:rejoin', { playerId: idA })).ok).toBe(true);
    const restored = await restore;
    expect(restored.permutation).toEqual(permA); // deterministic seed (req §6)
  });

  it('at reveal, the ranking becomes visible to a spectator/projector (privacy lifts)', async () => {
    h = await boot();
    const m = await h.masterSocket();
    await openBingo(m);
    for (let i = 0; i < 3; i++) {
      const p = await h.playerSocket();
      await h.send(p, 'room:join', { nickname: `사람${i + 1}` });
    }
    await h.send(m, 'master:start', { gameId: 'bingo' });

    const proj = await h.projectorSocket();
    let bView: any = null;
    proj.on('room:state', (msg: any) => {
      if (msg.gameId === 'bingo') bView = msg.view;
    });
    await new Promise((r) => setTimeout(r, 100));
    // During play the spectator sees no standings.
    expect(bView?.standings ?? []).toHaveLength(0);

    await h.send(m, 'master:end', { gameId: 'bingo' });
    await h.send(m, 'master:reveal', { gameId: 'bingo', step: 0 });
    await new Promise((r) => setTimeout(r, 150));
    expect(bView.state).toBe('REVEAL');
    expect(bView.standings).toHaveLength(3); // ranking now public (reveal)
  });
});

describe('yutnori — gameplay and time-skip through real sockets', () => {
  const setup = async (m: import('socket.io-client').Socket, malPerTeam = 1) => {
    expect((await h.send(m, 'event:create', { title: '한마당' })).ok).toBe(true);
    expect(
      (await h.send(m, 'master:setup', {
        gameId: 'yutnori',
        teams: [{ name: 'A조' }, { name: 'B조' }],
        malPerTeam,
        timeLimitMin: 20,
        miniGames: false, // core-flow tests; a dedicated test covers mini-games
      })).ok,
    ).toBe(true);
    expect((await h.send(m, 'master:start', { gameId: 'yutnori' })).ok).toBe(true);
  };

  it('throw → move passes the turn; undo reverts it', async () => {
    h = await boot();
    const m = await h.masterSocket();
    const board = await h.boardSocket();
    // 2 말 → the throw offers 2 candidates, so no auto-move races the assertion.
    await setup(m, 2);

    let view: any = null;
    board.on('room:state', (msg: any) => {
      if (msg.gameId === 'yutnori') view = msg.view;
    });

    const rec = h.once(board, 'throw:recorded');
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '걸' });
    const pending = await rec;
    expect(pending.candidates.length).toBeGreaterThan(0);
    expect((await h.send(m, 'master:move', { gameId: 'yutnori', malId: pending.candidates[0].malId })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(view.turnTeamName).toBe('B조'); // turn passed after a no-bonus roll

    await h.send(m, 'master:undo', { gameId: 'yutnori' });
    await new Promise((r) => setTimeout(r, 120));
    expect(view.turnTeamName).toBe('A조'); // undo reverted the turn
  });

  it('ends with endReason "timeup" when the clock is skipped past the limit (req §10)', async () => {
    h = await boot();
    const m = await h.masterSocket();
    const board = await h.boardSocket();
    await setup(m);

    // Play one complete turn so it is a clean turn boundary (not mid-turn).
    const rec = h.once(board, 'throw:recorded');
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '걸' });
    const p = await rec;
    await h.send(m, 'master:move', { gameId: 'yutnori', malId: p.candidates[0].malId });
    await new Promise((r) => setTimeout(r, 80));

    // Skip past the 20-minute limit and tick.
    h.advance(21 * MS_PER_MIN);
    const ended = h.once(board, 'game:ended', 4000);
    const ack = await h.send(m, 'master:tick', { gameId: 'yutnori' });
    expect(ack.ok).toBe(true);
    const end = await ended;
    expect(end.reason).toBe('timeup');
  });
});

describe('yutnori — mini-games (Mario Party mode) over sockets', () => {
  it('landing on a 미니게임 칸 triggers a roulette; a fail cancels the move and passes the turn', async () => {
    h = await boot();
    const m = await h.masterSocket();
    const board = await h.boardSocket();
    await h.send(m, 'event:create', { title: '한마당' });
    await h.send(m, 'master:setup', {
      gameId: 'yutnori',
      teams: [{ name: 'A조' }, { name: 'B조' }],
      malPerTeam: 1,
      timeLimitMin: 20,
      miniGames: true,
    });
    await h.send(m, 'master:start', { gameId: 'yutnori' });

    let view: any = null;
    board.on('room:state', (msg: any) => {
      if (msg.gameId === 'yutnori') view = msg.view;
    });

    // Spots are ≥6: reach 6 with 윷(4) 대기→4 (bonus keeps the turn) then 개(2) 4→6.
    const triggered = h.once(board, 'minigame:triggered');
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '윷' });
    await new Promise((r) => setTimeout(r, 80));
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '개' });
    const trig = await triggered;
    expect(trig.station).toBe(6);
    await new Promise((r) => setTimeout(r, 80));
    expect(view.pendingMiniGame).not.toBeNull();

    // A throw is refused mid-challenge.
    expect((await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '도' })).ok).toBe(false);

    // Spin, then judge a FAIL — the move reverts (to 4, NOT 대기) and the turn passes.
    await h.send(m, 'master:minigame:spin', { gameId: 'yutnori', game: 'jegi' });
    await h.send(m, 'master:minigame:resolve', { gameId: 'yutnori', success: false });
    await new Promise((r) => setTimeout(r, 120));
    expect(view.pendingMiniGame).toBeNull();
    expect(view.teams[0].mal[0].progress).toBe(4); // back to the on-board spot, not 대기
    expect(view.turnTeamName).toBe('B조'); // turn passed
  });

  it('a success keeps the move on the board', async () => {
    h = await boot();
    const m = await h.masterSocket();
    const board = await h.boardSocket();
    await h.send(m, 'event:create', { title: '한마당' });
    await h.send(m, 'master:setup', {
      gameId: 'yutnori',
      teams: [{ name: 'A조' }, { name: 'B조' }],
      malPerTeam: 1,
      timeLimitMin: 20,
      miniGames: true,
    });
    await h.send(m, 'master:start', { gameId: 'yutnori' });
    let view: any = null;
    board.on('room:state', (msg: any) => {
      if (msg.gameId === 'yutnori') view = msg.view;
    });
    const triggered = h.once(board, 'minigame:triggered');
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '윷' });
    await new Promise((r) => setTimeout(r, 80));
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '개' });
    await triggered;
    await h.send(m, 'master:minigame:spin', { gameId: 'yutnori', game: 'jegi' });
    await h.send(m, 'master:minigame:resolve', { gameId: 'yutnori', success: true });
    await new Promise((r) => setTimeout(r, 120));
    expect(view.teams[0].mal[0].progress).toBe(6); // move stands
  });
});

describe('reset + robustness', () => {
  it('a player acting before any event errors, and never crashes the host', async () => {
    h = await boot();
    const p = await h.playerSocket();
    // No event yet — each action must be answered, not thrown (a crash would
    // kill both games). Two in a row proves the host is still serving.
    expect((await h.send(p, 'room:join', { nickname: '일찍' })).ok).toBe(false);
    expect((await h.send(p, 'cell:fill', { cellIndex: 0, query: '1' })).ok).toBe(false);
  });

  it('game:reset returns one game to SETUP, leaving the event and sibling intact', async () => {
    h = await boot();
    const m = await h.masterSocket();
    await h.send(m, 'event:create', { title: '한마당' });
    await h.send(m, 'master:setup', {
      gameId: 'yutnori',
      teams: [{ name: 'A조' }, { name: 'B조' }],
      malPerTeam: 1,
      timeLimitMin: 20,
      miniGames: false,
    });
    await h.send(m, 'master:start', { gameId: 'yutnori' });

    let summary: any = null;
    m.on('event:summary', (s: any) => (summary = s));
    expect((await h.send(m, 'game:reset', { gameId: 'yutnori' })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(summary.games.yutnori.state).toBe('SETUP'); // reset
    expect(summary.code).toBeTruthy(); // event still there
  });

  it('event:reset closes the event and returns to no-event', async () => {
    h = await boot();
    const m = await h.masterSocket();
    await h.send(m, 'event:create', { title: '한마당' });
    let summary: any = 'unset';
    m.on('event:summary', (s: any) => (summary = s));
    expect((await h.send(m, 'event:reset')).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(summary).toBeNull(); // back to the create screen
    // A fresh event can now be created without restarting the process.
    expect((await h.send(m, 'event:create', { title: '두 번째' })).ok).toBe(true);
  });
});

describe('cross-game — one host, two games (req §5, §11)', () => {
  it('both run at once; a reveal is exclusive and seizes the projector', async () => {
    h = await boot();
    const m = await h.masterSocket();

    // Open one event and bring BOTH games to ENDED.
    await h.send(m, 'event:create', { title: '한마당' });
    await h.send(m, 'master:setTraits', { gameId: 'bingo', texts: TRAITS });
    for (let i = 0; i < 2; i++) {
      const p = await h.playerSocket();
      await h.send(p, 'room:join', { nickname: `사람${i + 1}` });
    }
    await h.send(m, 'master:start', { gameId: 'bingo' });

    await h.send(m, 'master:setup', {
      gameId: 'yutnori',
      teams: [{ name: 'A조' }, { name: 'B조' }],
      malPerTeam: 1,
      timeLimitMin: 20,
      miniGames: false,
    });
    await h.send(m, 'master:start', { gameId: 'yutnori' });

    // Both RUNNING at once (req §4.3, §5.1).
    let summary: any = null;
    m.on('event:summary', (s: any) => {
      summary = s;
    });
    await h.send(m, 'master:throw', { gameId: 'yutnori', roll: '걸' }); // provoke a summary
    await new Promise((r) => setTimeout(r, 80));
    expect(summary.games.bingo.state).toBe('RUNNING');
    expect(summary.games.yutnori.state).toBe('RUNNING');

    // End both, then reveal yutnori — it seizes the projector.
    await h.send(m, 'master:end', { gameId: 'bingo' });
    // yutnori: end via master.
    await h.send(m, 'master:end', { gameId: 'yutnori' });
    expect((await h.send(m, 'master:reveal', { gameId: 'yutnori', step: 0 })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(summary.projectorLock).toBe('yutnori'); // reveal seized the screen (req §5.2)

    // A second reveal while yutnori is revealing is refused (req §5.3).
    const busy = await h.send(m, 'master:reveal', { gameId: 'bingo', step: 0 });
    expect(busy.ok).toBe(false);
    expect(busy.error.code).toBe('REVEAL_BUSY');
  });
});
