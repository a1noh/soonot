/**
 * Round material from the team's Google Doc (게임 자료 tab), 2026-11-24.
 *
 * Only the host and the console import this file, so the questions and words
 * never ship to the projector or the phones ahead of time: the host sends one
 * question at a time, only while it is on screen.
 */

export interface FourChoice {
  question: string;
  /** The four 보기, for the MC only. The projector shows just 1–4 (진행순서: 보기는 번호만). */
  choices: readonly [string, string, string, string];
  /** 1–4: the option marked red in the team's doc (게임 자료 tab), or null if none. */
  answer: 1 | 2 | 3 | 4 | null;
}

/** 3라운드 · 4지선다 (닥터 스트레인지의 1,400만 분의 1). */
export const FOUR_CHOICE: readonly FourChoice[] = [
  { question: '다윗은 사울 왕을 이은 이스라엘의 왕 중 하나로, 성경에 ‘하나님 마음에 합한 자’로 기록되어 있는데요. 다윗이 이스라엘 민족에게 신임을 얻게 된 계기는 전쟁에서 누구를 쓰러트렸기 때문입니까?', choices: ['타노스', '볼드모트', '시라소니', '골리앗'], answer: 4 },
  { question: '다윗이 싸움 중 사용한 ‘그것’은?', choices: ['방망이', '돌팔매', '장미칼', '에네르기파'], answer: 2 },
  { question: '노아는 방주를 만들어 하나님이 보내신 물의 심판을 피했는데요. 비가 그치고 마른 땅을 찾기 위해 새를 내보냈는데, 그 새의 종류는?', choices: ['비둘기', '펠리칸', '이문세', '관세'], answer: 1 },
  { question: '애굽에서 이스라엘 백성들을 이끈 이스라엘의 첫 지도자 모세는 시내산으로 올라가 40일 동안 하나님에게서 ‘이것’을 받아 왔습니다. ‘이것’은 무엇이었습니까?', choices: ['스타벅스 기프트카드', '십계명', '포르쉐', '왕자 복근'], answer: 2 },
  { question: '‘언약궤’는 이스라엘 민족에게 중요한 성물 중 하나죠. 언약궤 안에는 3가지 물건이 들어 있었는데요, 십계명 돌판과 만나 항아리, 그리고 마지막 물건은?', choices: ['아론의 싹 난 칫솔', '아론의 싹 난 양말', '아론의 싹 난 틀니', '아론의 싹 난 지팡이'], answer: 4 },
  { question: '여호수아는 이스라엘의 지도자 중 하나로 많은 공적을 세웠는데요. 그중 난공불락의 요새를 총 13바퀴 돌아 함락시킨 그 요새의 이름은?', choices: ['여리고성', '알겠성', '하울의 움직이는 성', '너와 결혼까지 생각했성'], answer: 1 },
  { question: '예수님은 3년의 공생애 동안 여러 사람들을 구원하셨습니다. 예수님을 따른 12제자 중 베드로가 예수님을 따르기 전에 가졌던 직업은?', choices: ['어부', '아프리카 비제이', '아이돌', '축구선수'], answer: 1 },
  { question: '예수님께서는 무엇이 제사보다 낫다고 하셨나요?', choices: ['두쫀쿠', '순종', '아이폰 17', '낮잠'], answer: 2 },
  { question: '요나는 하나님이 보내신 선지자 중 한 명입니다. 하나님께서 명하신 곳으로 가지 않고 다른 곳으로 가다가 물고기에게 삼켜져 3일 동안 물고기 뱃속에서 지냈는데요. 하나님께서 요나에게 가라고 명하신 곳은?', choices: ['니느웨', '전라도', '하와이', '호그와트'], answer: 1 },
  { question: '윈투 스튜디오 예배 시간은?', choices: ['1:00pm', '2:00pm', '3:00pm', '2:00am'], answer: 2 },
  { question: '인투교회 담임 목사님은?', choices: ['임영웅', '심상현', '헬렌켈러', '법륜스님'], answer: 2 },
  { question: '올해 2026 인투교회 표어는?', choices: ['날 따라와', '너 일로와', '나를 따르라', '물을 따르라'], answer: 3 },
  { question: '온누리교회 3대 DNA 중 아닌 것은?', choices: ['1:1 양육', 'QT', '순모임', '러닝크루'], answer: 4 },
  { question: '새가족 교육 3주차 때는 QT에 대해 배우는데, QT는 무엇의 줄임말인가요?', choices: ['Quitting Time', 'Question Time', 'Quiet Time', 'Quality Time'], answer: 3 },
  { question: '새가족 교육 때 매주 목사님과 함께 와서 기도해 주시는 청년이 있는데, 그 청년이 교회에서 담당하는 공식 사역 직책은?', choices: ['기도맨', '광고맨', '핸디맨', '대표엠씨'], answer: 4 },
];

/**
 * 6라운드 · 일심동체 제시어, for the MC's remote only. 진행순서: 팀당 5개. Each team
 * gets one 하·중·상 set from the doc plus two more from the rest (sets 7–9, then the
 * 추가 제시어); what is left is for a 1등 tie (동점 팀끼리 몇 개 더).
 */
const SETS: readonly (readonly [string, string, string])[] = [
  ['하트', '야구', '사랑'],
  ['만세', '사진 찍기', '기도'],
  ['토끼', '수영', '자유'],
  ['경례', '골프', '배고픔'],
  ['근육맨', '축구', '아멘'],
  ['X (엑스)', '발레', '부끄러움'],
];
const MORE: readonly string[] = [
  '고릴라', '바이올린', '깜짝 놀람', '슈퍼맨', '낚시', '찬양', '코끼리', '복싱', '행복',
  '가위바위보', '미스코리아', '귀요미 삐짐', '유혹', '셀카 포즈', '윙크', '청순 가련',
];
export const ONE_MIND: { teams: readonly (readonly string[])[]; tie: readonly string[] } = {
  teams: SETS.map((set, i) => [...set, MORE[2 * i]!, MORE[2 * i + 1]!]),
  tie: MORE.slice(SETS.length * 2),
};
