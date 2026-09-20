/**
 * One game's pane (req §7).
 *
 * The host supplies the **frame** — the lifecycle label, the state, the enable
 * toggle and (from milestone 5) the reveal driver. The *contents* are supplied
 * by the game (bingo §11.3/§11.4, yutnori §13.2), which is why this file knows
 * nothing about traits, 말 or cells. At milestones 3–4 each module contributes
 * its own body into the `children` slot.
 */

import type { ReactNode } from 'react';
import type { GameId, RoomState } from '../shared/lifecycle.js';
import { t } from '../shared/i18n.js';

export interface GamePaneProps {
  gameId: GameId;
  state: RoomState;
  enabled: boolean;
  focused: boolean;
  /** req §5.4 — the unfocused game's blocking condition must still surface. */
  blocking?: boolean;
  onFocus(): void;
  onToggleEnabled(next: boolean): void;
  children?: ReactNode;
}

export function GamePane(props: GamePaneProps) {
  const { gameId, state, enabled, focused, blocking, onFocus, onToggleEnabled } = props;

  return (
    <section
      className={`pane pane--${gameId}${focused ? ' is-focused' : ''}${
        enabled ? '' : ' is-disabled'
      }`}
      aria-label={t(`host.game.${gameId}`)}
      onClick={onFocus}
    >
      <header className="pane__head">
        <h2 className="pane__title">
          <span className="pane__dot" aria-hidden="true" />
          {t(`host.game.${gameId}`)}
        </h2>

        {/* State is carried by text, never by colour alone (req §11). */}
        <span className={`chip chip--${state.toLowerCase()}`}>{t(`host.state.${state}`)}</span>

        {blocking ? (
          <span className="chip chip--blocking" role="status">
            ⚠ {t('host.console.blocking')}
          </span>
        ) : null}

        <label className="toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.currentTarget.checked)}
          />
          <span>{enabled ? t('host.console.enable') : t('host.console.disabled')}</span>
        </label>
      </header>

      <div className="pane__body">
        {props.children ?? (
          <p className="pane__empty">
            {/* Milestone 2: the frame is real, the contents arrive with the
                modules at milestones 3 and 4. */}
            {gameId === 'yutnori' ? '윷놀이 모듈 연결 예정 (마일스톤 3)' : '빙고 모듈 연결 예정 (마일스톤 4)'}
          </p>
        )}
      </div>
    </section>
  );
}
