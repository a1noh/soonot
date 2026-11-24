/**
 * The remote's tools for the rounds the team plays from the projector:
 *  - 일심동체: each 제시어 can go up big (화면에) or stay with the MC;
 *  - 찬양 (2라운드): 3·2·1 → 1초, 3·2·1 → 3초, 정답 + ~10초, per clip;
 *  - 눈코입 (4라운드): zoomed picture, then 정답 (whole photo + name), per photo.
 * The clips and photos are uploaded here into media/songs and media/faces.
 */
import { useCallback, useEffect, useState } from 'react';
import type { EventSummary } from '../event/event.js';
import { ONE_MIND } from '../event/quiz.js';
import { roundItems, type RoundDir, type RoundItem } from '../event/roundItems.js';

type Send = (payload: Record<string, unknown>) => Promise<unknown>;

export function WordsPanel({ event, send }: { event: EventSummary; send: Send }) {
  const card = event.projectorCard?.kind === 'word' ? event.projectorCard : null;
  const row = (team: number, words: readonly string[], label: string) => (
    <li key={team}>
      <b>{label}</b>
      <span className="remote__wordrow">
        {words.map((w, i) => {
          const on = card?.text === w;
          return (
            <button
              key={w}
              type="button"
              className={`btn remote__word${on ? ' is-on' : ''}`}
              onClick={() => void send(on ? { off: true } : { kind: 'word', team, i }).catch(() => {})}
            >
              {w}
            </button>
          );
        })}
      </span>
    </li>
  );
  return (
    <div className="remote__extra" aria-label="일심동체 제시어">
      <p className="remote__extrahead">
        🤝 제시어 · 누르면 화면에 크게 (다시 누르면 내려가요)
        {card ? <span className="remote__onair">화면: {card.text}</span> : null}
      </p>
      <ol className="remote__words">
        {ONE_MIND.teams.map((words, i) => row(i, words, `${i + 1}번째 팀`))}
        {row(-1, ONE_MIND.tie, '동점 연장')}
      </ol>
    </div>
  );
}

function useRoundFiles(dir: RoundDir): { items: RoundItem[]; reload(): void; upload(files: FileList): Promise<string | null> } {
  const [items, setItems] = useState<RoundItem[]>([]);
  const reload = useCallback(() => {
    void fetch(`/master/media?dir=${dir}`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ files?: { name: string }[] }>)
      .then((j) => setItems(roundItems(dir, (j.files ?? []).map((f) => f.name))))
      .catch(() => {});
  }, [dir]);
  useEffect(reload, [reload]);
  const upload = async (files: FileList) => {
    for (const f of Array.from(files)) {
      const res = await fetch(`/master/media?dir=${dir}&name=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'include', body: f });
      if (!res.ok) return ((await res.json().catch(() => ({}))) as { message?: string }).message ?? '올리지 못했어요';
    }
    reload();
    return null;
  };
  return { items, reload, upload };
}

export function MediaRoundPanel({ dir, event, send }: { dir: RoundDir; event: EventSummary; send: Send }) {
  const { items, upload } = useRoundFiles(dir);
  const [n, setN] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const card = event.projectorCard;
  const mine = card && ((dir === 'songs' && card.kind === 'song') || (dir === 'faces' && card.kind === 'face')) ? card : null;
  useEffect(() => {
    if (mine && 'n' in mine) setN(mine.n);
  }, [mine]);
  const it = items[n - 1];
  const go = (payload: Record<string, unknown>) => void send(payload).catch((e: Error) => setMsg(e.message));
  const songs = dir === 'songs';
  return (
    <div className="remote__extra" aria-label={songs ? '찬양 맞추기' : '눈코입'}>
      <p className="remote__extrahead">
        {songs ? '🎵 찬양' : '👁 눈코입'} {items.length ? `${n} / ${items.length}` : ''}
        {mine ? <span className="remote__onair">화면에 떠 있음</span> : null}
      </p>
      {items.length === 0 ? (
        <p className="remote__note">
          {songs
            ? '아직 음원이 없어요. “01 제이어스 - 내 모습 이대로.mp3”처럼 번호 + 제목으로 올려주세요.'
            : '아직 사진이 없어요. “01 유재석.jpg”처럼 번호 + 이름으로 올려주세요 (눈코입만 자른 사진은 “01 유재석-zoom.jpg”).'}
        </p>
      ) : (
        <>
          <p className="remote__qtext">
            {n}. {it?.name}
          </p>
          <div className="remote__qnav">
            {songs ? (
              <>
                <button type="button" className="btn remote__chip remote__chip--go" onClick={() => go({ kind: 'song', n, phase: 'play1' })}>
                  3·2·1 → 1초
                </button>
                <button type="button" className="btn remote__chip" onClick={() => go({ kind: 'song', n, phase: 'play3' })}>
                  3·2·1 → 3초
                </button>
                <button type="button" className="btn remote__chip" onClick={() => go({ kind: 'song', n, phase: 'answer' })}>
                  정답 + 10초
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn remote__chip remote__chip--go" onClick={() => go({ kind: 'face', n, revealed: false })}>
                  사진 띄우기
                </button>
                <button type="button" className="btn remote__chip" onClick={() => go({ kind: 'face', n, revealed: true })}>
                  정답 공개
                </button>
              </>
            )}
          </div>
          <div className="remote__qnav">
            <button type="button" className="btn remote__chip" disabled={n <= 1} onClick={() => setN(n - 1)}>
              ◀ 이전
            </button>
            <button type="button" className="btn remote__chip" disabled={!mine} onClick={() => void send({ off: true }).catch(() => {})}>
              화면 내리기
            </button>
            <button type="button" className="btn remote__chip" disabled={n >= items.length} onClick={() => setN(n + 1)}>
              다음 ▶
            </button>
          </div>
        </>
      )}
      <label className="btn btn--ghost btn--sm remote__upload">
        {songs ? '음원 올리기' : '사진 올리기'}
        <input
          type="file"
          multiple
          accept={songs ? 'audio/*' : 'image/*'}
          hidden
          onChange={(e) => {
            const f = e.currentTarget.files;
            if (f?.length) void upload(f).then(setMsg);
            e.currentTarget.value = '';
          }}
        />
      </label>
      {msg ? <p className="remote__note">{msg}</p> : null}
    </div>
  );
}
