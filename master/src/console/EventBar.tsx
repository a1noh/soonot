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

const CHANNELS: readonly (GameId | 'auto')[] = ['auto', 'bingo', 'yutnori', 'stones'];

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
        <span className={`conn ${connected ? 'conn--ok' : 'conn--off'}`} role="status">
          <span className="dot" aria-hidden="true" />
          {connected ? '연결됨' : '연결 끊김 · 다시 연결 중'}
        </span>

        {event ? (
          // A plain group, not a <fieldset>: the legend box renders over the
          // border and there is nothing here to submit.
          <div className="seg" role="group" aria-label="발표 화면에 띄울 게임">
            <span className="seg__legend" aria-hidden="true">
              발표 화면
            </span>
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                className={`seg__btn${
                  (event.projectorLock ?? event.projector) === channel ? ' is-on' : ''
                }`}
                aria-pressed={(event.projectorLock ?? event.projector) === channel}
                title={channel === 'auto' ? '방금 움직인 게임을 자동으로 보여줘요' : undefined}
                onClick={() => onSetProjector(channel)}
              >
                {channel === 'auto' ? t('host.console.projector.auto') : t(`host.game.${channel}`)}
              </button>
            ))}
            {/* req §5.2 — a reveal seizes the screen, but the operator can still
                click another channel to take it back (e.g. move on to 윷놀이 after
                a 발표) — that releases the lock without a 다시 하기. */}
            {event.projectorLock ? (
              <span className="seg__locked">
                순위 발표 중 · 다른 게임을 누르면 바뀌어요
              </span>
            ) : null}
          </div>
        ) : null}

        {event ? (
          <button
            type="button"
            className="btn btn--primary"
            title="발표 화면(/p)을 새 창으로 엽니다 — 그 화면의 전체화면 버튼을 누르세요"
            onClick={() => window.open('/p', 'soonot-projector', 'noopener')}
          >
            발표 화면 열기
          </button>
        ) : null}

        <details className="more">
          <summary className="btn btn--ghost more__btn">더보기</summary>
          <div className="more__menu">
            {event ? (
              <button
                type="button"
                className="more__item more__item--danger"
                onClick={() => {
                  if (confirm('현재 행사를 초기화하고 새로 시작할까요? 모든 게임 기록이 지워집니다.')) onResetEvent();
                }}
              >
                새 행사 시작
                <small>모든 게임 기록을 지워요</small>
              </button>
            ) : null}
            <button type="button" className="more__item" onClick={() => onSignOut(false)}>
              {t('host.console.signout')}
            </button>
            <button type="button" className="more__item" onClick={() => onSignOut(true)}>
              {t('host.console.signoutAll')}
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
