/**
 * One i18n module, namespaced per game (req §9.1).
 *
 * Korean-first with an English toggle, in both games' §15. The shape is
 * `{ ko, en }` keyed by a dotted id; the host owns the `host.*` namespace and
 * each game owns its own. Written once here instead of twice.
 */

export type Locale = 'ko' | 'en';

export const DEFAULT_LOCALE: Locale = 'ko';

export type Strings = Record<string, string>;

const host: Record<Locale, Strings> = {
  ko: {
    'host.signin.title': '마스터 로그인',
    'host.signin.passcode': '패스코드',
    'host.signin.submit': '들어가기',
    'host.signin.failed': '패스코드가 올바르지 않아요',
    'host.signin.locked': '잠시 후 다시 시도해주세요',
    'host.console.title': '마스터 콘솔',
    'host.console.code': '참여 코드',
    'host.console.projector': '프로젝터',
    'host.console.projector.auto': '자동',
    'host.console.signout': '로그아웃',
    'host.console.signoutAll': '모든 기기에서 로그아웃',
    'host.console.createEvent': '행사 만들기',
    'host.console.eventTitle': '행사 이름',
    'host.console.noEvent': '아직 행사가 없어요',
    'host.console.disabled': '오늘은 쉬어요',
    'host.console.enable': '사용',
    'host.console.blocking': '대기 중',
    'host.game.bingo': '빙고',
    'host.game.yutnori': '윷놀이',
    'host.state.SETUP': '준비 중',
    'host.state.LOBBY': '대기 중',
    'host.state.RUNNING': '진행 중',
    'host.state.ENDED': '종료됨',
    'host.state.REVEAL': '순위 발표',
  },
  en: {
    'host.signin.title': 'Master sign-in',
    'host.signin.passcode': 'Passcode',
    'host.signin.submit': 'Enter',
    'host.signin.failed': "That passcode isn't right",
    'host.signin.locked': 'Try again in a little while',
    'host.console.title': 'Master console',
    'host.console.code': 'Event code',
    'host.console.projector': 'Projector',
    'host.console.projector.auto': 'Auto',
    'host.console.signout': 'Sign out',
    'host.console.signoutAll': 'Sign out everywhere',
    'host.console.createEvent': 'Create event',
    'host.console.eventTitle': 'Event name',
    'host.console.noEvent': 'No event yet',
    'host.console.disabled': 'Not tonight',
    'host.console.enable': 'Enable',
    'host.console.blocking': 'Waiting',
    'host.game.bingo': 'Bingo',
    'host.game.yutnori': 'Yutnori',
    'host.state.SETUP': 'Setup',
    'host.state.LOBBY': 'Lobby',
    'host.state.RUNNING': 'Running',
    'host.state.ENDED': 'Ended',
    'host.state.REVEAL': 'Reveal',
  },
};

const registry: Record<Locale, Strings> = { ko: { ...host.ko }, en: { ...host.en } };

/** A game registers its own namespace at import time (spec §2). */
export function registerStrings(namespace: string, strings: Record<Locale, Strings>): void {
  for (const locale of ['ko', 'en'] as const) {
    for (const [key, value] of Object.entries(strings[locale])) {
      registry[locale][`${namespace}.${key}`] = value;
    }
  }
}

export function t(key: string, locale: Locale = DEFAULT_LOCALE): string {
  return registry[locale][key] ?? registry[DEFAULT_LOCALE][key] ?? key;
}
