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

/** The six stones the MCs name on the main board. */
export const DEFAULT_STONES: readonly string[] = [
  '믿음 스톤',
  '소망 스톤',
  '사랑 스톤',
  '지혜 스톤',
  '온유 스톤',
  '은혜 스톤',
];

/**
 * The secret 7th stone. Never on the board: it appears only if 1위 is tied,
 * as the prize of the 결정전, and goes to the team that wins it.
 */
export const SECRET_STONE = { name: '감사 스톤', color: '#FFD873' } as const;

export const DEFAULT_TEAMS: readonly string[] = ['아이언맨', '헐크', '캡틴 아메리카', '토르', '블랙 위도우', '호크아이'];

/** The projector's heading for the whole team game. */
export const DEFAULT_TITLE = '어벤추수 땡스게임';

/** What the final podium shows (from the MC script). */
export const DEFAULT_PRIZES: { first: string; second: string; everyone: string } = {
  first: '100불 상금',
  second: '50불 상금',
  everyone: '70불 커피 기프트카드',
};

/**
 * The fixed play order, from the MC script (어벤추수 땡스게임 1–6라운드). Pick 1
 * opens game 1, whatever stone was tapped. Each instruction opens with the real
 * game and "!", so the MC never has to guess.
 */
export const DEFAULT_GAMES: readonly { name: string; players: string; instructions: string }[] = [
  {
    name: '아이언맨의 비행 테스트',
    players: '2명',
    instructions:
      '코끼리 종이비행기! 가위바위보로 순서를 정해요. 한 명은 날개가 있는 종이비행기를 접고, 다른 한 명은 코끼리 코로 꼭 10바퀴 돈 뒤 시작선에서 날려요. 가장 멀리 날린 팀이 스톤을 얻어요.',
  },
  {
    name: '가디언즈 오브 찬양',
    players: '모두',
    instructions:
      '찬양 맞추기! 찬양을 1초, 그다음 3초 들려드려요. 10초 상의 후 “팀 이름!”을 외치면 가장 먼저 손든 팀이 정확한 제목을 맞혀요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '닥터 스트레인지의 1,400만 분의 1',
    players: '모두',
    instructions:
      '미스터리 4지선다! 보기 내용은 비밀, 1~4번 중 정답 번호만 맞혀요. “하나, 둘, 셋!”에 팀별로 정한 번호를 손가락으로 동시에 들어요. 100% 운, 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '호크아이의 매의 눈',
    players: '모두',
    instructions:
      '눈·코·입 이미지 퀴즈! 두 사람이 함께 나온 사진의 눈, 코, 입만 크게 확대해 보여드려요. 10초 상의 후 가장 먼저 손들고 정확한 이름을 외친 팀이 점수를 얻어요. 가장 많이 맞힌 팀이 스톤을 얻어요.',
  },
  {
    name: '토르의 번개 같은 센스',
    players: '1명',
    instructions:
      '타이밍 맞추기! 가위바위보로 순서를 정해요. 휘트니 휴스턴 “I Will Always Love You”를 연습 없이 딱 한 번 들려드려요. 드럼 박자에 맞춰 가장 정확하게 친 팀이 스톤을 얻어요.',
  },
  {
    name: '어벤져스 어셈블',
    players: '3명',
    instructions:
      '일심동체 텔레파시! 한 팀씩 나와 팀마다 다른 제시어 5개에 도전해요. “하나, 둘, 셋!”에 세 명이 똑같은 포즈를 취하면 성공. 가장 많이 성공한 팀이 스톤을 얻고, 1등이 동점이면 동점 팀끼리 제시어 몇 개 더!',
  },
];

/** The 동점 결정전. Played only by teams level on stones, after 게임 종료. */
export const DEFAULT_TIEBREAK: { name: string; players: string; instructions: string } = {
  name: '타노스의 핑거 스냅',
  players: '모두',
  instructions:
    '인피니티 컵 컬링! 20초 안에 팀장이 선에 서서 컵을 최대한 멀리 놓아요. 팀원들은 팀장을 꼭 붙잡아 주세요. 던지기·굴리기·튕기기 금지, 선을 넘으면 실격!'
};
