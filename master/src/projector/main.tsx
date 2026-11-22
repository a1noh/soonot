/** Mount point for the projector. The component tree is in App.tsx so tests can
 *  import it without this side-effecting render. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * The projector window stays open all evening, so after an update it would keep
 * running yesterday's code. Every 30 s it checks the page's script against the
 * one the server serves now, and reloads itself when they differ (the room just
 * sees the same screen come back; every state comes from the server).
 */
const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
if (mine) {
  window.setInterval(() => {
    void fetch(location.pathname, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        const now = /src="(\/assets\/projector-[^"]+\.js)"/.exec(html)?.[1];
        if (now && now !== mine) location.reload();
      })
      .catch(() => {});
  }, 30_000);
}
