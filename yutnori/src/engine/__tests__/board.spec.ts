import { describe, expect, it } from 'vitest';
import { advancementOf, destinations, isHome, isOnBoard, isWaiting, nodeXY } from '../../shared/board';
import { HOME } from '../../shared/constants';

describe('board geometry (spec §7.1)', () => {
  it('puts the four corners at the four square corners', () => {
    expect(nodeXY(0)).toEqual([1, 1]); // 참 — bottom right
    expect(nodeXY(5)).toEqual([0, 1]); // 모 — bottom left
    expect(nodeXY(10)).toEqual([0, 0]); // 뒷모 — top left
    expect(nodeXY(15)).toEqual([1, 0]); // 모동 — top right
  });

  it('places 방 at the centre and the diagonal 밭 between corner and centre', () => {
    expect(nodeXY(23)).toEqual([0.5, 0.5]); // 방
    const [x] = nodeXY(21); // 모(0,1) → centre(.5,.5): first third
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.5);
  });
});

describe('progress encoding + movement (req §6)', () => {
  it('classifies 대기, board (incl. diagonals) and 집', () => {
    expect(isWaiting(0)).toBe(true);
    expect(isOnBoard(0)).toBe(false);
    expect(isOnBoard(1)).toBe(true);
    expect(isOnBoard(23)).toBe(true); // 방 is a real 밭
    expect(isOnBoard(HOME)).toBe(false);
    expect(isHome(HOME)).toBe(true);
  });

  it('moves along the outer ring and overshoots home (req §6)', () => {
    expect(destinations(0, 5)).toEqual([5]);
    expect(destinations(17, 2)).toEqual([19]);
    expect(destinations(19, 1)).toEqual([20]);
    expect(destinations(19, 5)).toEqual([20]); // overshoot → 집
  });

  it('offers both the 지름길 and the 바깥길 when resting on a branch 밭', () => {
    // 모(5), move 3: outer 5→8, diagonal 5→21→22→방(23).
    expect(new Set(destinations(5, 3))).toEqual(new Set([8, 23]));
    // 뒷모(10), move 3: outer →13, diagonal →방(23).
    expect(new Set(destinations(10, 3))).toEqual(new Set([13, 23]));
    // 방(23), move 3: exit arm →집(20), or continue arm →모동(15).
    expect(new Set(destinations(23, 3))).toEqual(new Set([20, 15]));
  });

  it('the 모 지름길 reaches 집 in 11칸 total (shortest course)', () => {
    // From 모(5), 6 more steps down the diagonal → 집. 5 + 6 = 11 from the start.
    expect(destinations(5, 6)).toContain(HOME);
  });

  it('advancement rises from 대기(0) to 집, and is shortcut-aware', () => {
    expect(advancementOf(0)).toBe(0); // 대기 = not started
    expect(advancementOf(HOME)).toBeGreaterThan(advancementOf(19)); // 집 is the most advanced
    expect(advancementOf(23)).toBeGreaterThan(advancementOf(1)); // 방 is far along
  });
});
