/**
 * The 윷놀이 board surface — `/y/:code` (master spec §9).
 *
 * Read-only by construction: it opens a socket on `/y`, which registers no
 * handlers at all, so there is no privileged channel on an unattended laptop
 * at the front of the room.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import type { BoardView } from '@soonot/yutnori/src/project.js';
import {
  BoardSvg,
  Clock,
  HomeTray,
  Standings,
} from '@soonot/yutnori/src/client/BoardSvg.js';
import './board.css';

function Board() {
  const [view, setView] = useState<BoardView | null>(null);
  const [connected, setConnected] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const socket = io('/y', {
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:state', (msg: { gameId: string; view: BoardView }) => {
      if (msg.gameId === 'yutnori') setView(msg.view);
    });
    // Granular events drive animation; state drives truth (master spec §6.2).
    socket.on('capture:announced', (d: { count: number }) => {
      setFlash(`잡혔다! ${d.count}개`);
      setTimeout(() => setFlash(null), 2200);
    });
    socket.on('turn:changed', (d: { teamName: string }) => {
      setView((v) => (v ? { ...v, turnTeamName: d.teamName } : v));
    });
    socket.on('board:update', () => {
      // positions arrive with the next room:state; nothing to do but re-render
    });
    return () => {
      socket.close();
    };
  }, []);

  if (!view) {
    return (
      <main className="board-page board-page--empty">
        <h1>윷놀이</h1>
        <p>{connected ? '게임을 기다리는 중…' : '연결 중…'}</p>
      </main>
    );
  }

  return (
    <main className="board-page">
      <header className="board-page__head">
        <h1>윷놀이</h1>
        <Clock ms={view.remainingMs} paused={view.paused} />
        {view.pendingMiniGame ? (
          <strong className="board-page__turn">🎡 {view.pendingMiniGame.teamName} 미니게임!</strong>
        ) : view.state === 'RUNNING' && view.turnTeamName ? (
          <strong className="board-page__turn">{view.turnTeamName} 차례</strong>
        ) : (
          <strong className="board-page__turn">{view.state}</strong>
        )}
      </header>

      <div className="board-page__grid">
        <BoardSvg view={view} />
        <aside className="board-page__side">
          <HomeTray view={view} />
          <h2>순위</h2>
          <Standings view={view} />
        </aside>
      </div>

      {flash ? <div className="board-page__flash" role="status">{flash}</div> : null}
      {!connected ? <div className="board-page__offline">연결이 끊어졌어요</div> : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Board />
  </StrictMode>,
);
