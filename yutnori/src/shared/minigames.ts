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
  { id: 'jegi', name: '제기차기', instruction: '제기를 3번 이상 차기', seconds: 20 },
  { id: 'names5', name: '이름 5개', instruction: '순장님/목사님 이름 5개 빨리 말하기', seconds: 15 },
  { id: 'ramen3', name: '라면 3개', instruction: '라면 종류 3개 빨리 말하기', seconds: 10 },
  { id: 'guess', name: '숫자 맞추기', instruction: '진행자가 정한 1~10 숫자 한 번에 맞추기', seconds: 15 },
  { id: 'squat', name: '스쿼트 10개', instruction: '온 팀이 스쿼트 10개', seconds: 20 },
  { id: 'freeze', name: '무궁화꽃', instruction: '"무궁화꽃이 피었습니다" — 5초간 완전히 정지', seconds: 8 },
  { id: 'praise3', name: '찬양 3곡', instruction: '찬양 제목 3개 대기', seconds: 15 },
  { id: 'bible3', name: '성경 인물', instruction: '성경 인물 3명 말하기', seconds: 12 },
  { id: 'food3', name: '음식 3개', instruction: '세 글자 음식 이름 3개 빨리 말하기', seconds: 10 },
  { id: 'pushup', name: '팔굽혀펴기', instruction: '대표 한 명이 팔굽혀펴기 5개', seconds: 20 },
  { id: 'country3', name: '나라 3개', instruction: '나라 이름 3개 말하기', seconds: 10 },
  { id: 'balance', name: '한 발 서기', instruction: '눈 감고 한 발로 10초 버티기', seconds: 12 },
];

export function miniGameById(id: string): MiniGame | undefined {
  return MINI_GAMES.find((g) => g.id === id);
}
