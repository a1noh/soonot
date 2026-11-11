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
  '#3D7BFF', // blue
  '#FFD23F', // yellow
  '#FF2E4D', // red
  '#A64DFF', // purple
  '#22E06B', // green
  '#FF8A1F', // orange
  '#FF6EC7', // pink
  '#E8F1FF', // white
];

export const DEFAULT_STONES: readonly string[] = [
  '예배 스톤',
  '섬김 스톤',
  '선교 스톤',
  '양육 스톤',
  '사역 스톤',
  '교제 스톤',
];

export const DEFAULT_TEAMS: readonly string[] = ['아이언맨', '헐크', '캡틴 아메리카', '토르', '블랙 위도우', '호크아이'];

/**
 * The fixed play order. Pick 1 opens game 1, whatever stone was tapped.
 * Names are Avengers-flavoured; the first words of each instruction say which
 * real game it is, so the MC never has to guess.
 */
export const DEFAULT_GAMES: readonly { name: string; players: string; instructions: string }[] = [
  {
    name: '타노스 격추 작전',
    players: '2명',
    instructions:
      '코끼리 종이비행기! 각 팀 2명이 나와요. 한 명씩 코끼리 코로 10바퀴 돈 뒤 종이비행기를 날려요. 두 비행기 중 더 멀리 간 기록으로 겨뤄, 가장 멀리 날린 팀이 스톤을 얻어요.',
  },
  {
    name: '그루트 노래방',
    players: '모두',
    instructions:
      '찬양 퀴즈! 찬양 전주나 한 소절을 듣고 제목을 맞혀요. 아는 팀은 손을 들고, 먼저 든 팀이 답해요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '닥터 스트레인지의 선택',
    players: '모두',
    instructions:
      '사지선다! 화면에 문제와 보기 4개가 나와요. 신호에 맞춰 모든 팀이 동시에 손가락으로 1~4를 들어요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '앤트맨 돋보기',
    players: '모두',
    instructions:
      '이미지 퀴즈! 아주 크게 확대한 그림이 조금씩 드러나요. 무엇인지 아는 팀은 손을 들고, 먼저 든 팀이 답해요. 틀리면 다른 팀에게 기회가 넘어가요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '스파이더맨 아재개그',
    players: '모두',
    instructions:
      '넌센스 퀴즈! 엉뚱한 아재개그 문제예요. 먼저 손을 든 팀이 답해요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '어벤져스 어셈블',
    players: '3명',
    instructions:
      '일심동체! 각 팀 3명이 나와요. 같은 질문에 서로 보지 않고 동시에 답을 적어요. 세 명의 답이 모두 같으면 1점. 가장 많이 맞춘 팀이 스톤을 얻어요.',
  },
];

/** The 동점 결정전. Played only by teams level on stones, after 게임 종료. */
export const DEFAULT_TIEBREAK: { name: string; players: string; instructions: string } = {
  name: '엔드게임',
  players: '모두',
  instructions:
    '컵 멀리 놓기! 바닥에 선을 긋고, 팀 전원이 서로 붙잡고 도와서 컵을 선 너머로 최대한 멀리 내려놓아요. 컵을 던지면 안 되고, 선을 넘으면 실격이에요. 선에서 컵이 가장 먼 팀이 이겨요.',
};
