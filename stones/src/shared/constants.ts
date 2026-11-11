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
  '스페이스 스톤',
  '마인드 스톤',
  '리얼리티 스톤',
  '파워 스톤',
  '타임 스톤',
  '소울 스톤',
];

export const DEFAULT_TEAMS: readonly string[] = ['아이언맨', '헐크', '캡틴 아메리카', '토르', '블랙 위도우', '호크아이'];

/** The fixed play order. Pick 1 opens game 1, whatever stone was tapped. */
export const DEFAULT_GAMES: readonly { name: string; players: string; instructions: string }[] = [
  {
    name: '코끼리 종이비행기',
    players: '2명',
    instructions:
      '각 팀 2명이 나와요. 한 명이 코끼리 코로 10바퀴 돈 뒤 종이비행기를 날리고, 이어서 다른 한 명도 똑같이 날려요. 두 비행기 중 더 멀리 간 기록으로 겨뤄, 가장 멀리 날린 팀이 스톤을 얻어요.',
  },
  {
    name: '찬양 퀴즈',
    players: '모두',
    instructions:
      '찬양 전주나 한 소절을 듣고 제목을 맞혀요. 정답을 아는 팀은 손을 들고, 먼저 든 팀이 답해요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '사지선다',
    players: '모두',
    instructions:
      '화면에 문제와 보기 4개가 나와요. 신호에 맞춰 모든 팀이 동시에 손가락으로 1~4를 들어요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '이미지 퀴즈',
    players: '모두',
    instructions:
      '화면의 그림이 조금씩 드러나요. 무엇인지 아는 팀은 손을 들고, 먼저 든 팀이 답해요. 틀리면 그 문제는 다른 팀에게 기회가 넘어가요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '넌센스',
    players: '모두',
    instructions:
      '넌센스 문제를 듣고 먼저 손을 든 팀이 답해요. 엉뚱할수록 정답에 가까워요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '일심동체',
    players: '3명',
    instructions:
      '각 팀 3명이 나와요. 같은 질문에 서로 보지 않고 동시에 답을 적어요. 세 명의 답이 모두 같으면 1점. 가장 많이 맞춘 팀이 스톤을 얻어요.',
  },
];
