/**
 * 진행 순서 — the run of show from the MC script, as cues the master steps
 * through. A cue is either a SLIDE (full-screen over the projector: an image or
 * a video, or a placeholder card with the cue's title until the file exists) or
 * a SCREEN (one of the games). Either can carry a BGM: a name for the MC, plus
 * an audio file the projector plays once there is one.
 *
 * Pure data and validation — the host owns the state, the screens only render.
 */
import { GAME_IDS, type GameId } from '../shared/lifecycle.js';

export type CueKind = 'slide' | 'screen';
export type Transition = 'fade' | 'zoom' | 'slide' | 'cut';
export const TRANSITIONS: readonly Transition[] = ['fade', 'zoom', 'slide', 'cut'];

/** What a step automates on the remote's 다음 ▶ (see console/autopilot.ts). */
export type AutoKind = 'bingo-open' | 'bingo-last-call' | 'bingo-reveal' | 'stones-start' | 'stones-rounds' | 'stones-final' | 'stones-podium';
export const AUTO_KINDS: readonly AutoKind[] = ['bingo-open', 'bingo-last-call', 'bingo-reveal', 'stones-start', 'stones-rounds', 'stones-final', 'stones-podium'];

export interface Cue {
  id: string;
  kind: CueKind;
  /** The cue's name in the list, and the big line on a placeholder slide. */
  title: string;
  /** A second line on the placeholder slide. */
  body: string;
  /** For `screen` cues: which game the projector shows. */
  screen: GameId | null;
  /** Image or video URL for a slide (`/media/…` or https://…). Empty = placeholder. */
  media: string;
  /** What the BGM is, for the MC and the console (e.g. "어벤져스 메인 테마"). */
  bgm: string;
  /** The audio file the projector plays. Empty = 음원 없음 (play it by hand). */
  bgmUrl: string;
  /** Master-only reminder. Never shown on the projector. */
  note: string;
  transition: Transition;
  /** This step's countdown in seconds (0 = none): the remote offers a button for it. */
  timer: number;
  /** What the countdown is for, shown over the projector (e.g. "종이비행기 접기"). */
  timerLabel: string;
  /**
   * A slide that runs alongside a game (a round's quiz slides): the remote shows
   * that game's controls on this step too. Screen cues always show their own game.
   */
  controls: GameId | null;
  /** The game actions 다음 ▶ performs inside this step, or null for none. */
  auto: AutoKind | null;
}

/** The slide on the projector right now — only what the room is allowed to see. */
export interface SlideOnAir {
  cueId: string;
  title: string;
  body: string;
  media: string;
  transition: Transition;
  /** A video waits on its first frame until the master presses 시작. */
  playing: boolean;
  /** Bumped by 시작, so the video starts from 0. */
  startedAt: number;
}

/** The BGM the projector plays. `url` empty = a placeholder the MC plays by hand. */
export interface BgmOnAir {
  cueId: string | null;
  name: string;
  url: string;
  playing: boolean;
  /** 0–1. */
  volume: number;
  /** Bumped on every (re)start, so the projector restarts the track from 0. */
  startedAt: number;
}

export interface ShowState {
  cues: Cue[];
  /** The cue the master last sent to the projector. */
  liveCue: string | null;
  slide: SlideOnAir | null;
  bgm: BgmOnAir | null;
  /** How the projector moves between game screens (the last screen cue's choice). */
  screenTransition: Transition;
  /** 🔇 소리 끄기: the projector plays no BGM, no video sound and no effects. */
  muted: boolean;
}

export const MAX_CUES = 80;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
export function isVideo(url: string): boolean {
  return VIDEO_EXT.test(url);
}

let seq = 0;
export function cueId(): string {
  seq = (seq + 1) % 1_000_000;
  return `c${Date.now().toString(36)}${seq.toString(36)}`;
}

type Seed = Partial<Omit<Cue, 'id'>> & { title: string };

function seed(list: Seed[]): Cue[] {
  return list.map((c, i) => ({
    id: `d${i + 1}`,
    kind: c.kind ?? 'slide',
    title: c.title,
    body: c.body ?? '',
    screen: c.screen ?? null,
    media: c.media ?? '',
    bgm: c.bgm ?? '',
    bgmUrl: c.bgmUrl ?? '',
    note: c.note ?? '',
    transition: c.transition ?? 'fade',
    timer: c.timer ?? 0,
    timerLabel: c.timerLabel ?? '',
    controls: c.controls ?? null,
    auto: c.auto ?? null,
  }));
}

/** Which game's controls the remote shows on this step: the screen's game, or the slide's link. */
export function controlsOf(cue: Cue): GameId | null {
  return cue.kind === 'screen' ? cue.screen : cue.controls;
}

/**
 * The 어벤추수 땡스게임 대본, in order. Every [슬라이드] and [BGM] line is here.
 * Whatever the app already draws (the QR, the stone board, each round's game
 * card, the 결정전, the podium) is a SCREEN cue — never a slide of the same
 * thing. Slides are only for what no game shows: the intro video, the seating
 * map, the closing card.
 *
 * Each round is ONE 스톤 step: the previous round's winner gets the stone, the
 * chooser shouts a stone, the round's game opens (pick N always opens game N),
 * it is played, and its winner is ticked.
 */
/**
 * Background music per step (scripts/fetch-music.mjs puts these in media/bgm/):
 * Kevin MacLeod (incompetech.com), CC BY 4.0. A step whose BGM is only a name
 * (a commercial song the MC plays by hand) stops the music instead.
 */
const MUSIC: Record<string, string> = {
  '빙고 QR 안내': '/media/bgm/local-forecast-elevator.mp3',
  'MC 등장 영상 · 타이틀': '/media/bgm/heroic-age.mp3',
  '빙고 5분 마지막 기회': '/media/bgm/volatile-reaction.mp3',
  '빙고 1등 공개': '/media/bgm/carefree.mp3',
  '어벤추수 땡스게임 메인 보드': '/media/bgm/five-armies.mp3',
  '최종 집계 · 타이브레이커': '/media/bgm/clash-defiant.mp3',
  '최종 시상': '/media/bgm/life-of-riley.mp3',
  '감사합니다': '/media/bgm/inspired.mp3',
};
/** The 대본's game steps, and what 다음 ▶ automates in each. */
const AUTO: Record<string, AutoKind> = {
  '빙고 QR 안내': 'bingo-open',
  '빙고 5분 마지막 기회': 'bingo-last-call',
  '빙고 1등 공개': 'bingo-reveal',
  '어벤추수 땡스게임 메인 보드': 'stones-start',
  '스톤 게임 · 1–6라운드': 'stones-rounds',
  '최종 집계 · 타이브레이커': 'stones-final',
  '최종 시상': 'stones-podium',
};

/**
 * The 스톤 rounds, in the order the game opens them (pick N opens game N). The
 * one 스톤 step shows the current round's line from here and plays its music.
 */
export interface RoundPlan {
  n: number;
  name: string;
  note: string;
  timer: number;
  timerLabel: string;
  bgm: string;
  /** Empty: the MC plays the song by hand, so the background music stops. */
  bgmUrl: string;
}
export const ROUNDS: readonly RoundPlan[] = [
  { n: 1, name: '아이언맨의 비행 테스트', note: '빙고 1등이 스톤 선택 → 두 팀씩 3경기 → 이긴 팀 체크 · 나온 12명 참가 선물', timer: 20, timerLabel: '종이비행기 접기', bgm: '경쾌한 질주', bgmUrl: '/media/bgm/run-amok.mp3' },
  { n: 2, name: '가디언즈 오브 찬양', note: '1라운드 1등 팀이 스톤 선택 · 곡마다 10초 상의 → 이긴 팀 체크', timer: 10, timerLabel: '상의 시간', bgm: '찬양 1~3초 컷 음원 · 직접 틀기', bgmUrl: '' },
  { n: 3, name: '닥터 스트레인지의 1,400만 분의 1', note: '대본: 2라운드 꼴찌 팀이 스톤 선택 (누가 고르나요에서 바꾸기) · “하나, 둘, 셋!”에 번호 들기', timer: 0, timerLabel: '', bgm: '신비롭고 미스터리한 추리 음악', bgmUrl: '/media/bgm/investigations.mp3' },
  { n: 4, name: '호크아이의 매의 눈', note: '3라운드 1등 팀이 스톤 선택 · 사진마다 10초 상의 → 이긴 팀 체크', timer: 10, timerLabel: '상의 시간', bgm: '태양 「눈, 코, 입」 · 직접 틀기', bgmUrl: '' },
  { n: 5, name: '토르의 번개 같은 센스', note: '4라운드 1등 팀이 스톤 선택 · 팀마다 한 명씩 드럼 → 이긴 팀 체크', timer: 0, timerLabel: '', bgm: 'I Will Always Love You (드럼) · 직접 틀기', bgmUrl: '' },
  { n: 6, name: '어벤져스 어셈블', note: '마지막 스톤은 고르지 않아요 · 한 팀씩 제시어 3개 → 이긴 팀 체크 (1등 동점이면 단판 연장전)', timer: 0, timerLabel: '', bgm: '장난스러운 긴장감', bgmUrl: '/media/bgm/sneaky-snitch.mp3' },
];

export const MUSIC_CREDIT = '음악 Kevin MacLeod (incompetech.com) · CC BY 4.0';

/** "Heroic Age" for one of our tracks (media/bgm/heroic-age.mp3), else null. */
export function trackTitle(url: string | null | undefined): string | null {
  const file = url?.split('/').pop()?.replace(/\.mp3$/, '');
  if (!url?.startsWith('/media/bgm/') || !file) return null;
  return file.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** "♪ Heroic Age — Kevin MacLeod · CC BY 4.0" for one of our tracks, else null. */
export function musicCredit(url: string | null | undefined): string | null {
  const file = url?.split('/').pop()?.replace(/\.mp3$/, '');
  if (!url?.startsWith('/media/bgm/') || !file) return null;
  const title = file.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `♪ ${title} — Kevin MacLeod (incompetech.com) · CC BY 4.0`;
}

export function defaultCues(): Cue[] {
  return scriptCues().map((c) => ({ ...c, bgmUrl: MUSIC[c.title] ?? c.bgmUrl, auto: AUTO[c.title] ?? null }));
}

function scriptCues(): Cue[] {
  return seed([
    { kind: 'screen', screen: 'bingo', title: '빙고 QR 안내', bgm: '밝고 잔잔한 식사 배경음악', note: '식사 30분 후 · 효준이 QR 안내' },
    // The intro video (39.6 s, ends on the title card). If the file is not on this
    // host the projector falls back to the placeholder title card.
    { title: 'MC 등장 영상 · 타이틀', body: '어벤추수 땡스게임', media: '/media/어벤추수-mc-intro-sfx.mp4', bgm: '웅장한 테마 (영상이 끝나면 이어져요)', transition: 'zoom', note: '5층 본당 · 시작을 누르면 영상 39초, 끝나면 BGM이 이어져요 · 효준/예진 인사' },
    { kind: 'screen', screen: 'bingo', title: '빙고 5분 마지막 기회', bgm: '긴장감 있는 카운트다운 음악', timer: 300, timerLabel: '빙고 마지막 기회', note: '5분 타이머가 바로 시작돼요 · 완료자가 많으면 다음 ▶ 으로 바로 종료' },
    { kind: 'screen', screen: 'bingo', title: '빙고 1등 공개', bgm: '축하 팡파르', note: '예진: 랜덤 5명 이름을 불러 확인 · 1등 소정의 상품' },
    { kind: 'screen', screen: 'stones', title: '어벤추수 땡스게임 메인 보드', bgm: '웅장한 어벤져스 테마', transition: 'zoom', note: '효준: 스톤 6가지 소개 · 빙고 1등이 첫 스톤을 골라요' },
    { title: '팀 별 자리 안내도', body: '이름표 색상과 디자인에 맞춰 앉아주세요' },
    // The whole 스톤 game is ONE step: the game drives the rounds (pick → play → winner),
    // and the remote shows the round's name, note, timer and music from ROUNDS below.
    { kind: 'screen', screen: 'stones', title: '스톤 게임 · 1–6라운드', note: '스톤을 고르면 그 라운드 게임이 열리고, 이긴 팀에게 스톤을 주면 다음 라운드로 넘어가요' },
    { kind: 'screen', screen: 'stones', title: '최종 집계 · 타이브레이커', bgm: '긴장감 넘치는 추격/스포츠 음악', note: '1위가 동점이면 타노스의 핑거 스냅 (인피니티 컵 컬링)' },
    { kind: 'screen', screen: 'stones', title: '최종 시상', bgm: '축하 팡파르', transition: 'zoom', note: '1등 100불 · 2등 50불 · 모든 팀 70불 커피 기프트카드' },
    { title: '감사합니다', body: '어벤추수 땡스게임 · MC 효준, 예진', bgm: '마무리 음악', note: '목사님 마무리' },
  ]);
}

export function defaultShow(): ShowState {
  return { cues: defaultCues(), liveCue: null, slide: null, bgm: null, screenTransition: 'fade', muted: false };
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A URL the screens may load: a file the host serves, or http(s). Anything else is dropped. */
export function safeUrl(v: unknown): string {
  const s = str(v, 500);
  if (!s) return '';
  if (s.startsWith('/media/') && !s.includes('..')) return s;
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  return '';
}

/** Validate a cue list from the console. Throws a message on anything unusable. */
export function parseCues(raw: unknown): Cue[] {
  if (!Array.isArray(raw)) throw new Error('진행 순서가 비어 있어요');
  if (raw.length > MAX_CUES) throw new Error(`장면은 ${MAX_CUES}개까지예요`);
  const seen = new Set<string>();
  return raw.map((r) => {
    const c = (r ?? {}) as Record<string, unknown>;
    let id = str(c['id'], 40);
    if (!id || seen.has(id)) id = cueId();
    seen.add(id);
    const kind: CueKind = c['kind'] === 'screen' ? 'screen' : 'slide';
    const screen = GAME_IDS.includes(c['screen'] as GameId) ? (c['screen'] as GameId) : null;
    const transition = TRANSITIONS.includes(c['transition'] as Transition) ? (c['transition'] as Transition) : 'fade';
    return {
      id,
      kind: kind === 'screen' && !screen ? 'slide' : kind,
      title: str(c['title'], 80) || '제목 없는 장면',
      body: str(c['body'], 200),
      screen: kind === 'screen' ? screen : null,
      media: safeUrl(c['media']),
      bgm: str(c['bgm'], 80),
      bgmUrl: safeUrl(c['bgmUrl']),
      note: str(c['note'], 200),
      transition,
      timer: Number.isInteger(c['timer']) && (c['timer'] as number) > 0 ? Math.min(3600, c['timer'] as number) : 0,
      timerLabel: str(c['timerLabel'], 40),
      controls: kind === 'slide' && GAME_IDS.includes(c['controls'] as GameId) ? (c['controls'] as GameId) : null,
      auto: AUTO_KINDS.includes(c['auto'] as AutoKind) ? (c['auto'] as AutoKind) : null,
    };
  });
}

/** Read a stored show back; anything broken falls back to the defaults. */
export function readShow(json: string | null | undefined): ShowState {
  if (!json) return defaultShow();
  try {
    const parsed = JSON.parse(json) as { cues?: unknown };
    return { ...defaultShow(), cues: parseCues(parsed.cues) };
  } catch {
    return defaultShow();
  }
}

/** Only the cue list is stored: what is on air does not survive a restart. */
export function writeShow(show: ShowState): string {
  return JSON.stringify({ cues: show.cues });
}
