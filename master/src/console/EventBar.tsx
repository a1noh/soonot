/**
 * The event bar (req §7): title, code, projector selector, sign-out.
 *
 * The projector selector lives **here**, at event level, never inside a game
 * pane — there is one screen and two games, and which one owns it is a property
 * of the event (req §5.2).
 */

import { useState } from 'react';
import type { EventSummary } from '../event/event.js';
import type { GameId } from '../shared/lifecycle.js';
import { t } from '../shared/i18n.js';
import { Qr, joinUrl } from '../shared/Qr.js';

export interface EventBarProps {
  event: EventSummary | null;
  connected: boolean;
  onSetProjector(setting: GameId | 'auto'): void;
  onSignOut(everywhere: boolean): void;
  onResetEvent(): void;
}

const CHANNELS: readonly (GameId | 'auto')[] = ['auto', 'bingo', 'yutnori'];

export function EventBar({ event, connected, onSetProjector, onSignOut, onResetEvent }: EventBarProps) {
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    if (!event) return;
    const url = joinUrl(event.code);
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <header className="bar">
      <div className="bar__id">
        <h1 className="bar__title">{event?.title ?? t('host.console.title')}</h1>
        {event ? (
          // Joining: players scan the QR OR type the 참여 코드. The operator can
          // also copy the join link to drop in a group chat.
          <div className="bar__join">
            <Qr text={joinUrl(event.code)} size={76} />
            <div className="bar__joinmeta">
              <p className="bar__code">
                <span className="bar__codeLabel">{t('host.console.code')}</span>
                <strong className="bar__codeValue">{event.code}</strong>
              </p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={copyLink}>
                {copied ? '복사됨! ✓' : '참여 링크 복사'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bar__right">
        <span
          className={`dot ${connected ? 'dot--ok' : 'dot--off'}`}
          title={connected ? 'connected' : 'disconnected'}
          role="status"
          aria-label={connected ? '연결됨' : '연결 끊김'}
        />

        {event ? (
          // A plain group, not a <fieldset>: the legend box renders over the
          // border and there is nothing here to submit.
          <div className="seg" role="group" aria-label={t('host.console.projector')}>
            <span className="seg__legend" aria-hidden="true">
              🖥 {t('host.console.projector')}
            </span>
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                className={`seg__btn${
                  (event.projectorLock ?? event.projector) === channel ? ' is-on' : ''
                }`}
                aria-pressed={(event.projectorLock ?? event.projector) === channel}
                disabled={event.projectorLock !== null}
                onClick={() => onSetProjector(channel)}
              >
                {channel === 'auto' ? t('host.console.projector.auto') : t(`host.game.${channel}`)}
              </button>
            ))}
            {/* req §5.2 — a reveal seizes the screen; the choice is suspended,
                not overwritten, and the console says so rather than appearing
                broken. */}
            {event.projectorLock ? (
              <span className="seg__locked">
                순위 발표 중 · {t(`host.game.${event.projectorLock}`)}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="bar__out">
          {event ? (
            <button
              type="button"
              className="btn btn--ghost"
              title="발표 화면(/p)을 새 창으로 엽니다 — 그 화면의 ⛶ 버튼으로 전체화면"
              onClick={() => window.open('/p', 'soonot-projector', 'noopener')}
            >
              🖥 발표 화면 열기
            </button>
          ) : null}
          {event ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (confirm('현재 행사를 초기화하고 새로 시작할까요? 두 게임 모두 지워집니다.')) onResetEvent();
              }}
            >
              새 행사
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => onSignOut(false)}>
            {t('host.console.signout')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onSignOut(true)}>
            {t('host.console.signoutAll')}
          </button>
        </div>
      </div>
    </header>
  );
}
