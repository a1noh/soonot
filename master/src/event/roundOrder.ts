/**
 * The team's own order for the media rounds, from the doc's script tab (2026-11-25).
 * The files can be named anything; these lists decide what the MC's remote shows, in
 * this order. A name with no file yet stays in the list, marked missing.
 */

/** 가디언즈 오브 찬양 (2라운드). Files: media/songs/찬양 NN 제목.mp3 (+ 찬양 NN 제목 후렴.mp3). */
export const SONGS: readonly { title: string; artist: string }[] = [
  { title: '주님의 사랑', artist: '마커스워십' },
  { title: '내 모습 이대로', artist: '제이어스' },
  { title: '우리가 주를 더욱 사랑하고', artist: '위러브' },
  { title: '여호와께 돌아가자', artist: '제이어스' },
  { title: '주를 바라보며', artist: '기프티드' },
  { title: '시편 139편', artist: '제이어스' },
  { title: '주의 자녀로 산다는 것은', artist: '기프티드' },
  { title: '공감하시네', artist: '위러브' },
  { title: '낮은 곳으로', artist: '위러브' },
  { title: '오직 예수뿐이네', artist: '마커스워십' },
  { title: '광야를 지나며', artist: '히즈윌' },
  { title: '다시 일어나', artist: '위러브' },
  { title: '푯대를 향하여', artist: '어노인팅' },
  { title: '그리운 예루살렘', artist: '위러브' },
  { title: '입례', artist: '위러브' },
  { title: '밝은 빛이 가득해', artist: '위러브' },
  { title: '감사함으로', artist: '마커스워십' },
  { title: '대단한 믿음 없어도', artist: '마커스워십' },
];

/** 호크아이의 매의 눈 (4라운드). The first is the 연습 (practice) photo. Files: media/faces/, matched by name. */
export const FACES: readonly { name: string; example?: boolean }[] = [
  { name: '타노스', example: true },
  { name: '유재석' },
  { name: '오은영' },
  { name: '이재용' },
  { name: '지드래곤' },
  { name: '김재환' },
  { name: '박정민' },
  { name: '미쓰라' },
  { name: '아이유' },
  { name: '송강' },
  { name: '이청원 목사님' },
  { name: '윈터' },
  { name: '장원영' },
  { name: '조정석' },
  { name: '전현무' },
  { name: '카더가든' },
];
