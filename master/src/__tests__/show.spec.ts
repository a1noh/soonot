/** 진행 순서 storage: reading a saved list back. */
import { describe, expect, it } from 'vitest';
import { defaultCues, readShow } from '../event/show';
describe('older default lists pick up today\'s 진행 순서', () => {
  const old = (titles: string[]) =>
    titles.map((title, i) => ({ ...defaultCues()[0]!, id: `o${i}`, kind: 'slide' as const, screen: null, title, media: '' }));
  const v1121 = ['빙고 QR 안내', 'MC 등장 영상 · 타이틀', '빙고 5분 마지막 기회', '빙고 1등 공개', '어벤추수 땡스게임 메인 보드', '팀 별 자리 안내도', '스톤 게임 · 1–6라운드', '최종 집계 · 타이브레이커', '최종 시상', '감사합니다'];

  it('replaces an untouched older list, keeping a file the user put on a step', () => {
    const saved = old(v1121);
    saved[5] = { ...saved[5]!, media: '/media/seating.png' }; // 팀 별 자리 안내도
    const read = readShow(JSON.stringify({ cues: saved })).cues;
    expect(read.map((c) => c.title)).toEqual(defaultCues().map((c) => c.title));
    expect(read.find((c) => c.title === '팀 별 자리 안내도')!.media).toBe('/media/seating.png');
    expect(read.find((c) => c.title === '빙고 마감 안내')!.body).toContain('6시까지');
  });

  it('leaves a list someone edited alone', () => {
    const edited = old([...v1121.slice(0, 9), '마무리 인사']);
    expect(readShow(JSON.stringify({ cues: edited })).cues.map((c) => c.title)).toEqual(edited.map((c) => c.title));
  });
});
