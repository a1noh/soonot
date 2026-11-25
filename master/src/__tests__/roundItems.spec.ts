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
