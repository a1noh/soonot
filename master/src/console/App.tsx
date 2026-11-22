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
import { YutnoriMasterPane } from '@soonot/yutnori/src/client/MasterPane.js';
import { StonesMasterPane } from '@soonot/stones/src/client/MasterPane.js';
import { StonesRemote } from '@soonot/stones/src/client/RemotePane.js';
import type { StonesView } from '@soonot/stones/src/project.js';
import type { MasterView } from '@soonot/bingo/src/project.js';
import type { Cue } from '../event/show.js';
import { BingoMasterPane } from './BingoPane.js';
import { RulesDoc } from '../rules/RulesDoc.js';
import { ShowPane } from './ShowPane.js';
import { BingoStatus, BotsBar, StonesStatus } from './RemoteStatus.js';
import { DEFAULT_BINGO_TRAITS } from '@soonot/bingo/src/shared/traits.js';
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
            placeholder="예) 2026 추수감사절 한마당"
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

type Tab = GameId | 'rules' | 'show';

/** The 빙고 1등's name once bingo has a result — they choose the first stone. */
function bingoWinnerOf(view: unknown): string | null {
  const winners = (view as { winners?: { rank: number; name: string }[] } | undefined)?.winners;
  return winners?.find((w) => w.rank === 1)?.name ?? null;
}

export function App() {
  const api = useConsole();
  // req §5.4 — one operator cannot watch several games closely at once, so the
  // console shows one game at a time. Every pane (and the rules) stays MOUNTED
  // and is toggled with `hidden`: switching away mid-setup must not discard a
  // half-typed team list, and the board must not remount on the way back.
  const [picked, setPicked] = useState<Tab | null>(null);

  if (api.auth === 'checking') return <main className="signin" aria-busy="true" />;
  if (api.auth === 'signed-out') return <SignIn onSubmit={api.signIn} />;
  if (!api.event) return <NewEvent onCreate={api.createEvent} />;

  const { event } = api;
  // The 진행 순서 remote is home base: it embeds whichever game the step needs.
  const tab: Tab = picked ?? 'show';
  const prepareBingo = () => api.send('bingo', 'master:setTraits', { texts: [...DEFAULT_BINGO_TRAITS] });
  /** One game's console controls — used by its own tab and embedded in the 진행 순서 remote. */
  const gamePane = (gameId: GameId) =>
    gameId === 'stones' ? (
      <StonesMasterPane
        view={(api.views.stones as never) ?? null}
        send={(ev, payload) => api.send('stones', ev, payload)}
        bingoWinner={bingoWinnerOf(api.views.bingo)}
      />
    ) : gameId === 'yutnori' ? (
      <YutnoriMasterPane view={(api.views.yutnori as never) ?? null} send={(ev, payload) => api.send('yutnori', ev, payload)} />
    ) : (
      <>
      {['SETUP', 'LOBBY', 'RUNNING'].includes((api.views.bingo as MasterView | undefined)?.state ?? '') ? (
        <BotsBar prepare={(api.views.bingo as MasterView | undefined)?.state === 'SETUP' ? prepareBingo : undefined} />
      ) : null}
      <BingoMasterPane
        view={(api.views.bingo as never) ?? null}
        send={(ev, payload) => api.send('bingo', ev, payload)}
        spotlight={event.bingoSpotlight}
        prize={event.bingoPrize}
        check={event.bingoCheck}
      />
      </>
    );
  /**
   * The remote's 스톤 controls: while rounds are being played, the round-shaped
   * panel (secret next game → chooser → stone; then winners). Before the game
   * starts and after the last stone, the full console (setup, 게임 종료, 결정전, 순위 발표).
   */
  const remoteGame = (gameId: GameId, cue: Cue) => {
    const sv = api.views.stones as StonesView | undefined;
    if (gameId === 'stones' && sv && sv.state === 'RUNNING' && (sv.pending || sv.played < sv.total)) {
      return (
        <StonesRemote
          view={sv}
          send={(ev, payload) => api.send('stones', ev, payload)}
          bingoWinner={bingoWinnerOf(api.views.bingo)}
          cueRound={null}
        />
      );
    }
    // Everywhere else the remote shows status only: 다음 ▶ is the one way forward.
    if (gameId === 'bingo') {
      return (
        <BingoStatus
          view={(api.views.bingo as MasterView | undefined) ?? null}
          spotlight={event.bingoSpotlight}
          check={event.bingoCheck}
          prepare={prepareBingo}
          send={(ev, payload) => api.send('bingo', ev, payload)}
        />
      );
    }
    if (gameId === 'stones') return <StonesStatus view={sv ?? null} send={(ev, payload) => api.send('stones', ev, payload)} />;
    void cue;
    return gamePane(gameId);
  };
  const blockingOf = (g: GameId) => (api.views[g] as { blocking?: boolean } | undefined)?.blocking === true;

  return (
    <div className="console">
      <EventBar
        event={event}
        connected={api.connected}
        onSetProjector={(s) => void api.setProjector(s)}
        onTimer={(seconds, label) => void api.setTimer(seconds, label)}
        onMute={(muted) => void api.setMuted(muted)}
        onSignOut={(everywhere) => void api.signOut(everywhere)}
        onResetEvent={() => void api.resetEvent()}
      />

      <nav className="gametabs" role="tablist" aria-label="게임 선택">
        <button
          type="button"
          role="tab"
          id="gametab-show"
          aria-selected={tab === 'show'}
          aria-controls="tabpanel-show"
          className={`gametab gametab--show${tab === 'show' ? ' is-on' : ''}`}
          onClick={() => setPicked('show')}
        >
          <span className="gametab__name">🎬 진행 순서</span>
          <span className="gametab__state chip">
            {event.liveCue && event.cues
              ? `${event.cues.findIndex((c) => c.id === event.liveCue) + 1}/${event.cues.length}`
              : `${event.cues?.length ?? 0}장면`}
          </span>
          {event.slide ? <span className="gametab__air">슬라이드 표시 중</span> : null}
        </button>
        {GAME_IDS.map((g) => {
          const st = event.games[g];
          const on = tab === g;
          const onAir = !event.slide && (event.projectorLock ?? event.projector) === g;
          return (
            <button
              key={g}
              type="button"
              role="tab"
              id={`gametab-${g}`}
              aria-selected={on}
              aria-controls={`pane-${g}`}
              className={`gametab gametab--${g}${on ? ' is-on' : ''}${st.enabled ? '' : ' is-off'}`}
              onClick={() => setPicked(g)}
            >
              <span className="gametab__dot" aria-hidden="true" />
              <span className="gametab__name">{t(`host.game.${g}`)}</span>
              <span className={`gametab__state chip chip--${st.state.toLowerCase()}`}>
                {st.enabled ? t(`host.state.${st.state}`) : '안 씀'}
              </span>
              {onAir ? <span className="gametab__air">화면 표시 중</span> : null}
              {blockingOf(g) && !on ? (
                <span className="gametab__alert" role="status">
                  확인 필요
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          id="gametab-rules"
          aria-selected={tab === 'rules'}
          aria-controls="tabpanel-rules"
          className={`gametab gametab--rules${tab === 'rules' ? ' is-on' : ''}`}
          onClick={() => setPicked('rules')}
        >
          윷놀이 규칙
        </button>
      </nav>

      <div className="console__panes">
        <div className="console__show" role="tabpanel" id="tabpanel-show" aria-labelledby="gametab-show" hidden={tab !== 'show'}>
          <ShowPane
            event={event}
            active={tab === 'show'}
            setTimer={api.setTimer}
            restartEvent={api.restartEvent}
            setMusic={api.setMusic}
            game={{ bingo: (api.views.bingo as MasterView | undefined) ?? null, send: api.send }}
            renderGame={remoteGame}
            stones={{
              view: (api.views.stones as StonesView | undefined) ?? null,
              rewind: (round) => api.send('stones', 'master:rewind', { round }),
            }}
            saveCues={api.saveCues}
            goCue={api.goCue}
            startCue={api.startCue}
            clearSlide={api.clearSlide}
            bgm={api.bgm}
          />
        </div>
        {GAME_IDS.map((gameId) => (
          <GamePane
            key={gameId}
            gameId={gameId}
            state={event.games[gameId].state}
            enabled={event.games[gameId].enabled}
            shown={tab === gameId}
            onToggleEnabled={(next) => void api.enableGame(gameId, next)}
            onReset={() => void api.resetGame(gameId)}
          >
            {gamePane(gameId)}
          </GamePane>
        ))}

        <div
          className="console__rules"
          role="tabpanel"
          id="tabpanel-rules"
          aria-labelledby="gametab-rules"
          hidden={tab !== 'rules'}
        >
          <a className="console__ruleslink" href="/rules" target="_blank" rel="noopener">
            규칙 새 창으로 열기 ↗
          </a>
          <RulesDoc />
        </div>
      </div>

      {api.error ? (
        <p className="console__error" role="alert">
          {api.error}
        </p>
      ) : null}
    </div>
  );
}
