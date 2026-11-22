import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * A console left open all evening keeps running the code it loaded. Every 30 s
 * it checks the script the server serves now; when it changed, a notice asks
 * for a reload (never an automatic one: the master may be typing in a form).
 */
const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
if (mine) {
  const timer = window.setInterval(() => {
    void fetch(location.pathname, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        const now = /src="(\/assets\/console-[^"]+\.js)"/.exec(html)?.[1];
        if (!now || now === mine || document.querySelector('.stalebar')) return;
        window.clearInterval(timer);
        const bar = document.createElement('div');
        bar.className = 'stalebar';
        bar.setAttribute('role', 'status');
        bar.textContent = '새 버전이 있어요';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '새로고침';
        btn.onclick = () => location.reload();
        bar.append(btn);
        document.body.append(bar);
      })
      .catch(() => {});
  }, 30_000);
}
