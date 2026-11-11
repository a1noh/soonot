export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;
export const MAX_STONES = 8;

/** Same team palette as 윷놀이, so a team keeps its colour across games. */
export const TEAM_COLORS: readonly string[] = [
  '#C0392B',
  '#1F6FB2',
  '#1E8449',
  '#B7791F',
  '#6C3483',
  '#117A73',
  '#A04000',
  '#2C3E50',
];

/** Stone glow colours, assigned in list order. */
export const STONE_COLORS: readonly string[] = [
  '#FF4D5E', // red
  '#FF9F1C', // orange
  '#FFD23F', // yellow
  '#3DDC84', // green
  '#4D8DFF', // blue
  '#B26BFF', // violet
  '#FF6EC7', // pink
  '#E8F1FF', // white
];

/** Placeholder stones. The master rewrites names and missions in setup. */
export const DEFAULT_STONES: readonly { name: string; mission: string }[] = [
  { name: '빨강 스톤', mission: '미션을 설정 화면에서 적어주세요.' },
  { name: '주황 스톤', mission: '미션을 설정 화면에서 적어주세요.' },
  { name: '노랑 스톤', mission: '미션을 설정 화면에서 적어주세요.' },
  { name: '초록 스톤', mission: '미션을 설정 화면에서 적어주세요.' },
  { name: '파랑 스톤', mission: '미션을 설정 화면에서 적어주세요.' },
  { name: '보라 스톤', mission: '미션을 설정 화면에서 적어주세요.' },
];

export const DEFAULT_TEAMS: readonly string[] = ['선교', '예배', '양육', '사역', '섬김', '교육', '친교'];
