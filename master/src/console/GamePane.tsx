/**
 * One game's pane (req §7).
 *
 * The host supplies the **frame** — the name, where the game is in its
 * lifecycle, the enable toggle and 다시 하기. The *contents* are supplied by the
 * game (bingo §11.3/§11.4, yutnori §13.2), which is why this file knows nothing
 * about traits, 말 or cells.
 *
 * Only the selected game is shown; the others stay mounted (`hidden`) so a
 * half-typed setup form survives switching tabs.
 */

import type { ReactNode } from 'react';
import type { GameId, RoomState } from '../shared/lifecycle.js';
import { t } from '../shared/i18n.js';

export interface GamePaneProps {
  gameId: GameId;
  state: RoomState;
  enabled: boolean;
  /** Is this the game on screen in the console right now? */
  shown: boolean;
  onToggleEnabled(next: boolean): void;
  onReset(): void;
  children?: ReactNode;
}

/** The order every game moves through, as the operator reads it. */
export const STEPS: readonly (readonly [RoomState, string])[] = [
  ['SETUP', '준비'],
  ['LOBBY', '입장'],
  ['RUNNING', '진행'],
  ['ENDED', '종료'],
  ['REVEAL', '순위 발표'],
];

export function Steps({ state }: { state: RoomState }) {
  const at = STEPS.findIndex(([s]) => s === state);
  return (
    <ol className="steps" aria-label="진행 단계">
      {STEPS.map(([s, label], i) => (
        <li
          key={s}
          className={`steps__item${i < at ? ' is-done' : ''}${i === at ? ' is-now' : ''}`}
          aria-current={i === at ? 'step' : undefined}
        >
          <span className="steps__num" aria-hidden="true">{i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function GamePane(props: GamePaneProps) {
  const { gameId, state, enabled, shown, onToggleEnabled, onReset } = props;
  const name = t(`host.game.${gameId}`);

  return (
    <section
      className={`pane pane--${gameId}${enabled ? '' : ' is-disabled'}`}
      id={`pane-${gameId}`}
      role="tabpanel"
      aria-labelledby={`gametab-${gameId}`}
      aria-label={name}
      hidden={!shown}
    >
      <header className="pane__head">
        <h2 className="pane__title">
          <span className="pane__dot" aria-hidden="true" />
          {name}
        </h2>
        <Steps state={state} />
        <div className="pane__tools">
          <label className="toggle" title="끄면 참가자 화면과 발표 화면에서 이 게임이 빠져요">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.currentTarget.checked)}
            />
            <span>{enabled ? '오늘 사용' : t('host.console.disabled')}</span>
          </label>
          {/* Reset this game back to setup — a fresh round without touching the
              other games or the event. */}
          {state !== 'SETUP' ? (
            <button
              type="button"
              className="btn btn--ghost pane__reset"
              onClick={() => {
                if (confirm(`${name}을(를) 처음부터 다시 시작할까요? 지금까지의 기록이 지워져요.`)) onReset();
              }}
            >
              다시 하기
            </button>
          ) : null}
        </div>
      </header>

      <div className="pane__body">{props.children}</div>
    </section>
  );
}
