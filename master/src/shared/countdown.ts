/**
 * The projector countdown, as any screen sees it. The server sends when the
 * timer ends on ITS clock plus its clock at send time (`serverNow`), so each
 * screen measures the gap to its own clock once per summary and counts down
 * against that — a projector laptop with a wrong clock still shows the right
 * time.
 */
import { useEffect, useRef, useState } from 'react';
import type { ProjectorTimer } from '../event/event.js';

/** Milliseconds left (0 when done), or null when no timer is set. */
export function useCountdown(timer: ProjectorTimer | null | undefined, serverNow: number | undefined): number | null {
  const skew = useRef(0);
  const seen = useRef<number | undefined>(undefined);
  const [, tick] = useState(0);

  // Line the clocks up the moment a new summary arrives — during render, so the
  // very first frame of a countdown already shows the right time.
  if (serverNow !== undefined && serverNow !== seen.current) {
    seen.current = serverNow;
    skew.current = serverNow - Date.now();
  }

  const endsAt = timer?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return undefined;
    // Tick while it runs and through the 3 s "시간 종료!" hold, then stop.
    const id = window.setInterval(() => {
      tick((n) => n + 1);
      if (endsAt - (Date.now() + skew.current) < -4000) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (!timer) return null;
  return Math.max(0, timer.endsAt - (Date.now() + skew.current));
}

/** 75 → "1:15", 9 → "0:09". Rounds up so "0:00" only shows at the end. */
export function formatLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
