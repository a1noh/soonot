/**
 * 화면 맞춤: some screens (an LED wall fed a 16:9 picture) only show part of it — on the 어벤추수
 * wall, the top ~¾. This shrinks the whole projector page into the part that is actually visible,
 * keeping its proportions, so nothing is cut.
 *
 * On the projector laptop: ↑ / ↓ set how much of the HEIGHT is visible, ← / → the WIDTH
 * (Shift = 5 % steps), 0 = back to full. The visible box is outlined while you adjust.
 * Saved on that laptop (localStorage); `?fit=100x75` (width x height, %) in the URL also works.
 */
const KEY = 'soonot.projector.fit';
type Fit = { w: number; h: number };

const clamp = (n: number) => Math.min(100, Math.max(30, Math.round(n)));

function load(): Fit {
  const q = /^(\d{2,3})x(\d{2,3})$/.exec(new URLSearchParams(location.search).get('fit') ?? '');
  if (q) return { w: clamp(Number(q[1])), h: clamp(Number(q[2])) };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Fit | null;
    if (s && typeof s.w === 'number' && typeof s.h === 'number') return { w: clamp(s.w), h: clamp(s.h) };
  } catch {
    /* private window or blocked storage: full screen */
  }
  return { w: 100, h: 100 };
}

function save(f: Fit) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* not saved; still applied for this page */
  }
}

export function installFit(root: HTMLElement) {
  let fit = load();
  let hideTimer = 0;
  const box = document.createElement('div');
  box.className = 'fitbox';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<span class="fitbox__label"></span>';
  document.body.appendChild(box);

  const apply = (show: boolean) => {
    const full = fit.w === 100 && fit.h === 100;
    const s = Math.min(fit.w, fit.h) / 100;
    // Scaled from the top centre: the page sits at the top of the visible band, centred across it.
    root.style.transform = full ? '' : `translate(${((fit.w / 100 - 1) * 50).toFixed(3)}vw, 0) scale(${s})`;
    root.style.transformOrigin = 'top center';
    document.documentElement.classList.toggle('is-fit', !full);
    box.style.width = `${fit.w}vw`;
    box.style.height = `${fit.h}vh`;
    box.querySelector('.fitbox__label')!.textContent =
      `화면 맞춤 · 가로 ${fit.w}% · 세로 ${fit.h}%  (↑↓ 세로 · ←→ 가로 · Shift = 5% · 0 = 원래대로)`;
    if (show) {
      box.classList.add('is-on');
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => box.classList.remove('is-on'), 2500);
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const step = e.shiftKey ? 5 : 1;
    const next = { ...fit };
    if (e.key === 'ArrowUp') next.h = clamp(fit.h + step);
    else if (e.key === 'ArrowDown') next.h = clamp(fit.h - step);
    else if (e.key === 'ArrowRight') next.w = clamp(fit.w + step);
    else if (e.key === 'ArrowLeft') next.w = clamp(fit.w - step);
    else if (e.key === '0') {
      next.w = 100;
      next.h = 100;
    } else return;
    e.preventDefault();
    fit = next;
    save(fit);
    apply(true);
  });
  apply(false);
}
