/**
 * When the projector plays an effect — derived from the games' state, so every
 * way a thing can happen (a tap on the console, the remote, a reconnect) sounds
 * the same, and a projector that (re)loads mid-game stays quiet until something
 * actually changes.
 *
 *   stone picked → reveal · stone won → win · 1위 tie → boom
 *   podium: 두구두구 → drumroll · each place called → 빠밤 (bam) · 1st → bam + fanfare · 모두 함께 → win
 *   a prize shown (최종 시상 상금, 빙고 1등 상품) → fanfare
 *   (bingo's 빙고! → ding and the timer's tick / buzzer are wired where they happen)
 */
import { useEffect, useRef } from 'react';
import type { EventSummary } from '../event/event.js';
import type { StonesView } from '@soonot/stones/src/project.js';
import { playSfx, setMuted } from './sound.js';

interface Seen {
  pick: string | null;
  seq: number | null;
  tie: boolean;
  reveal: number;
  secret: string | null;
}

function podium(now: number, before: number): void {
  if (now === before || now < 0) return;
  if (now === 0) playSfx('drumroll');
  else if (now >= 1 && now <= 3 && now > before) {
    playSfx('bam'); // each place called: 빠밤!
    if (now === 3) window.setTimeout(() => playSfx('fanfare'), 700); // 1등 / 1위
  } else if (now === 4 && now > before) playSfx('win');
}

export function useGameSfx(
  summary: EventSummary | null,
  stones: StonesView | null,
  bingo: { state: string; revealStep: number } | null,
): void {
  useEffect(() => setMuted(!!summary?.muted), [summary?.muted]);

  const s = useRef<Seen | null>(null);
  useEffect(() => {
    if (!stones) return;
    const cur: Seen = {
      pick: stones.pending?.stoneId ?? null,
      seq: stones.lastResult?.seq ?? null,
      tie: stones.state === 'ENDED' && !!(stones.firstTie || stones.activeTiebreak),
      reveal: stones.state === 'REVEAL' ? stones.revealStep : -1,
      secret: stones.secretStone?.teamId ?? null,
    };
    const before = s.current;
    s.current = cur;
    if (!before) return; // first view after (re)load: nothing happened yet
    if (cur.pick && cur.pick !== before.pick) playSfx('reveal');
    if (cur.seq !== null && cur.seq !== before.seq) playSfx('win');
    if (cur.tie && !before.tie) playSfx('boom');
    if (cur.secret && cur.secret !== before.secret) playSfx('fanfare'); // the 감사 스톤 is won
    podium(cur.reveal, before.reveal);
  }, [stones]);

  // A prize shown big (최종 시상 상금 beat, 빙고 1등 상품): a fanfare as it appears.
  const prize = useRef<string | null>(null);
  useEffect(() => {
    const cur = `${summary?.podiumPrize ?? ''}|${summary?.bingoPrize ? 'b' : ''}`;
    const before = prize.current;
    prize.current = cur;
    if (before === null || !summary) return;
    const opened = (summary.podiumPrize != null && !before.startsWith(String(summary.podiumPrize))) || (summary.bingoPrize && !before.endsWith('b'));
    if (opened) playSfx('fanfare');
  }, [summary?.podiumPrize, summary?.bingoPrize]);

  const b = useRef<number | null>(null);
  useEffect(() => {
    if (!bingo) return;
    const cur = bingo.state === 'REVEAL' ? bingo.revealStep : -1;
    const before = b.current;
    b.current = cur;
    if (before === null) return;
    podium(cur, before);
  }, [bingo?.state, bingo?.revealStep]);
}
