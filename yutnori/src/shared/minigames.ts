/**
 * The mini-game catalog — the "Mario Party" layer (req: 미니게임 칸).
 *
 * Each is a tiny team challenge done in the room in a few seconds; the master
 * judges 성공/실패. The roulette picks one by `id`, which is recorded on the
 * TurnEvent so replay/recovery are deterministic even though the pick was random.
 *
 * Edit freely — add, remove, or reword. `seconds` is an optional on-screen timer.
 */
export interface MiniGame {
  readonly id: string;
  readonly name: string;
  readonly instruction: string;
  readonly seconds?: number;
}

export const MINI_GAMES: readonly MiniGame[] = [
  { id: 'ramen3', name: '라면 이름', instruction: '라면 이름 3개 연속으로 말하기', seconds: 12 },
  { id: 'balance', name: '한 발 버티기', instruction: '팀원 전체 한 발로 10초 버티기', seconds: 12 },
  { id: 'pushup', name: '팔굽혀펴기', instruction: '팔굽혀펴기 5개 성공하기', seconds: 20 },
  { id: 'choseong', name: '초성 퀴즈', instruction: '진행자 초성 퀴즈 맞히기', seconds: 15 },
  { id: 'telepathy', name: '텔레파시 하트', instruction: '하트 동작 텔레파시 맞추기', seconds: 10 },
  { id: 'bottle', name: '물병 세우기', instruction: '물병 세우기 3번 안에 성공하기', seconds: 20 },
  { id: 'elephant', name: '코끼리코', instruction: '코끼리코 5바퀴 돌고 일자로 걷기', seconds: 20 },
  { id: 'standup', name: '등 맞대고 일어나기', instruction: '등 맞대고 손 안 쓰고 일어나기', seconds: 20 },
  { id: 'songword', name: '제시어 노래', instruction: '제시어가 들어간 노래 부르기 (예: 사랑, 주)', seconds: 15 },
  { id: 'nolaugh', name: '절대 웃지 않기', instruction: '10초 동안 웃지 않고 버티기', seconds: 10 },
  { id: 'pencil', name: '연필 꽂기', instruction: '연필을 연필꽂이에 던져 넣기', seconds: 15 },
  { id: 'coin', name: '동전 받기', instruction: '동전 손등 → 공중에 던지기 → 잡기', seconds: 15 },
];

export function miniGameById(id: string): MiniGame | undefined {
  return MINI_GAMES.find((g) => g.id === id);
}
