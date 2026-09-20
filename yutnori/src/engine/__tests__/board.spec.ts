import { describe, expect, it } from 'vitest';
import { advance, isHome, isOnBoard, isWaiting, stationXY } from '../../shared/board';
import { HOME, STATION_COUNT } from '../../shared/constants';

describe('board geometry (spec §7.1)', () => {
  it('places 참 at the bottom right and closes the ring', () => {
    expect(stationXY(0)).toEqual([1, 1]);
    // Walking the ring returns adjacent to the start, never past it.
    expect(stationXY(19)).toEqual([1, 0.8]);
  });

  it('puts the four corners at the four square corners', () => {
    expect(stationXY(0)).toEqual([1, 1]);   // bottom right — 참
    expect(stationXY(5)).toEqual([0, 1]);   // bottom left
    expect(stationXY(10)).toEqual([0, 0]);  // top left
    expect(stationXY(15)).toEqual([1, 0]);  // top right
  });

  it('keeps every station inside the unit square and all 20 distinct', () => {
    const seen = new Set<string>();
    for (let i = 0; i < STATION_COUNT; i++) {
      const [x, y] = stationXY(i);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(STATION_COUNT);
  });

  it('rejects an out-of-range station index', () => {
    expect(() => stationXY(-1)).toThrow(RangeError);
    expect(() => stationXY(STATION_COUNT)).toThrow(RangeError);
  });
});

describe('progress encoding (req §6)', () => {
  it('classifies 대기, board and 집', () => {
    expect(isWaiting(0)).toBe(true);
    expect(isOnBoard(0)).toBe(false);
    expect(isOnBoard(1)).toBe(true);
    expect(isOnBoard(19)).toBe(true);
    expect(isOnBoard(HOME)).toBe(false);
    expect(isHome(HOME)).toBe(true);
  });

  it('sends an overshoot home rather than requiring an exact count', () => {
    expect(advance(19, 1)).toBe(HOME);
    expect(advance(19, 5)).toBe(HOME);   // overshoot, still home (req §6)
    expect(advance(17, 2)).toBe(19);
    expect(advance(0, 5)).toBe(5);
  });
});
