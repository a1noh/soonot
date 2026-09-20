/**
 * `/master` — the console (req §7).
 *
 * Milestone 2's acceptance: **sign in once; two empty panes; sign-out rotates.**
 * The panes are empty because the games plug into them at milestones 3 and 4.
 */

import { useState, type FormEvent } from 'react';
import { GAME_IDS, type GameId } from '../shared/lifecycle.js';
import { t } from '../shared/i18n.js';
import { useConsole } from './useConsole.js';
import { EventBar } from './EventBar.js';
import { GamePane } from './GamePane.js';
import '../shared/tokens.css';
import './console.css';

function SignIn({ onSubmit }: { onSubmit(passcode: string): Promise<{ ok: boolean; locked?: boolean }> }) {
  const [passcode, setPasscode] = useState('');
  const [failed, setFailed] = useState<null | 'bad' | 'locked'>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await onSubmit(passcode);
    setBusy(false);
    if (!res.ok) {
      setFailed(res.locked ? 'locked' : 'bad');
      setPasscode('');
    }
  }

  return (
    <main className="signin">
      <form className="card" onSubmit={submit}>
        <h1 className="card__title">{t('host.signin.title')}</h1>
        <label className="field">
          <span className="field__label">{t('host.signin.passcode')}</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.currentTarget.value)}
          />
        </label>
        {/* One generic message; failures are never distinguished (spec §4.2). */}
        {failed ? (
          <p className="field__error" role="alert">
            {failed === 'locked' ? t('host.signin.locked') : t('host.signin.failed')}
          </p>
        ) : null}
        <button className="btn btn--primary" type="submit" disabled={busy || !passcode}>
          {t('host.signin.submit')}
        </button>
      </form>
    </main>
  );
}

function NewEvent({ onCreate }: { onCreate(title: string): Promise<void> }) {
  const [title, setTitle] = useState('');
  return (
    <main className="signin">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void onCreate(title.trim());
        }}
      >
        <h1 className="card__title">{t('host.console.noEvent')}</h1>
        <label className="field">
          <span className="field__label">{t('host.console.eventTitle')}</span>
          <input
            className="field__input"
            value={title}
            autoFocus
            placeholder="2026 가을 교회 한마당"
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
        </label>
        <button className="btn btn--primary" type="submit" disabled={!title.trim()}>
          {t('host.console.createEvent')}
        </button>
      </form>
    </main>
  );
}

export function App() {
  const api = useConsole();
  // req §5.4 — one operator cannot watch two games closely at once, so the
  // console names the one being driven and compacts the other.
  const [focus, setFocus] = useState<GameId>('yutnori');

  if (api.auth === 'checking') return <main className="signin" aria-busy="true" />;
  if (api.auth === 'signed-out') return <SignIn onSubmit={api.signIn} />;
  if (!api.event) return <NewEvent onCreate={api.createEvent} />;

  const { event } = api;

  return (
    <div className={`console focus--${focus}`}>
      <EventBar
        event={event}
        connected={api.connected}
        onSetProjector={(s) => void api.setProjector(s)}
        onSignOut={(everywhere) => void api.signOut(everywhere)}
      />

      <div className="console__panes">
        {GAME_IDS.map((gameId) => (
          <GamePane
            key={gameId}
            gameId={gameId}
            state={event.games[gameId].state}
            enabled={event.games[gameId].enabled}
            focused={focus === gameId}
            onFocus={() => setFocus(gameId)}
            onToggleEnabled={(next) => void api.enableGame(gameId, next)}
          />
        ))}
      </div>

      {api.error ? (
        <p className="console__error" role="alert">
          {api.error}
        </p>
      ) : null}
    </div>
  );
}
