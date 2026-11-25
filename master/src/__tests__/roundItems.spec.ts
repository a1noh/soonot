/** Round media naming: ours (NN name-zoom / NN name) and the team's (name / name 정답). */
import { describe, expect, it } from 'vitest';
import { roundItems } from '../event/roundItems';

describe('roundItems', () => {
  it('pairs the team’s own photo names: X (question) + X 정답 / X_정답 (answer), double extensions too', () => {
    const items = roundItems('faces', ['유재석.PNG', '유재석 정답.PNG', '청목.PNG', '청목 정답.PNG.jpg', '윈터_정답.png', '윈터.PNG']);
    expect(items.map((i) => i.name.normalize('NFC'))).toEqual(['윈터', '유재석', '청목'].map((s) => s.normalize('NFC')));
    const yu = items.find((i) => i.name === '유재석')!;
    expect(yu.url).toContain(encodeURIComponent('유재석 정답.PNG'));
    expect(yu.zoomUrl).toContain(encodeURIComponent('유재석.PNG'));
    expect(items.find((i) => i.name === '청목')!.url).toContain(encodeURIComponent('청목 정답.PNG.jpg'));
  });

  it('keeps our numbered naming and order: NN name-zoom (question) + NN name (answer)', () => {
    const items = roundItems('faces', ['02 유재석.webp', '02 유재석-zoom.png', '01 김재환-zoom.png', '01 김재환.png', '03 혼자.jpg']);
    expect(items.map((i) => i.name)).toEqual(['김재환', '유재석', '혼자']);
    expect(items[1]!.url).toContain('webp');
    expect(items[1]!.zoomUrl).toContain('zoom');
    expect(items[2]!.zoomUrl).toBeNull(); // one picture: the projector zooms into it
  });

  it('songs: numbered order, name after the number', () => {
    const items = roundItems('songs', ['10 온 땅의 주인 (어노인팅).mp3', '02 Love Never Fails.mp3', 'cover.jpg']);
    expect(items.map((i) => i.name)).toEqual(['Love Never Fails', '온 땅의 주인 (어노인팅)']);
  });
});

describe('the team’s order (roundOrder.ts)', () => {
  it('songs: 18 in the doc order, title · artist, with the 후렴 clip; no file = missing', async () => {
    const { showItems } = await import('../event/roundItems');
    const items = showItems('songs', ['찬양 02 내 모습 이대로.mp3', '찬양 02 내 모습 이대로 후렴.mp3', '01 내 모습 이대로 제이어스.mp3']);
    expect(items).toHaveLength(18);
    expect(items[0]).toMatchObject({ name: '주님의 사랑 · 마커스워십', missing: true });
    expect(items[1]).toMatchObject({ name: '내 모습 이대로 · 제이어스', missing: false });
    expect(items[1]!.chorusUrl).toContain(encodeURIComponent('후렴'));
  });

  it('faces: 타노스 first as 연습, then the doc order; an old extra (손흥민) is left out', async () => {
    const { showItems } = await import('../event/roundItems');
    const items = showItems('faces', ['15 손흥민.png', '15 손흥민-zoom.png', '02 유재석.webp', '02 유재석-zoom.png']);
    expect(items.map((i) => i.name).slice(0, 3)).toEqual(['타노스', '유재석', '오은영']);
    expect(items[0]).toMatchObject({ example: true, missing: true });
    expect(items[1]).toMatchObject({ example: false, missing: false });
    expect(items.some((i) => i.name === '손흥민')).toBe(false);
  });

  it('일심동체: 5 words per team, 하 2 · 중 2 · 상 1, none used twice', async () => {
    const { ONE_MIND } = await import('../event/quiz');
    expect(ONE_MIND.teams).toHaveLength(6);
    for (const t of ONE_MIND.teams) expect(t.map((w) => w.level)).toEqual(['하', '하', '중', '중', '상']);
    const all = ONE_MIND.teams.flat().map((w) => w.text);
    expect(new Set(all).size).toBe(30);
    expect(ONE_MIND.spare.map((w) => w.text)).toEqual(['가위바위보']);
    expect(ONE_MIND.tie).toHaveLength(3);
  });
});
