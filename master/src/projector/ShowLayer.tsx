/**
 * The 진행 순서 on the projector: a slide over the game screen (with the
 * cue's transition in and out), and the BGM.
 *
 * A slide with no file is a title card — it reads as a designed screen, so a
 * slide that was never made still looks deliberate in front of the room.
 *
 * Browsers only play sound after someone has touched the page. The ⛶ button
 * counts; otherwise a small prompt asks for one tap and everything plays.
 */
import { useEffect, useRef, useState } from 'react';
import { isVideo, musicCredit, type BgmOnAir, type SlideOnAir } from '../event/show.js';
import { isMuted, onMutedChange } from './sound.js';
import { Gem } from '@soonot/stones/src/client/Gem.js';
import { DEFAULT_STONES, STONE_COLORS } from '@soonot/stones/src/shared/constants.js';
import './show.css';

/** 🔇 소리 끄기 from the console, as a React value. */
function useMuted(): boolean {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMutedChange(setM), []);
  return m;
}

/* ---- sound unlock -------------------------------------------------------- */

let unlocked = false;
const unlockListeners = new Set<() => void>();
function markUnlocked() {
  if (unlocked) return;
  unlocked = true;
  for (const f of unlockListeners) f();
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', markUnlocked, { capture: true });
  window.addEventListener('keydown', markUnlocked, { capture: true });
}
function useUnlocked(): boolean {
  const [u, setU] = useState(unlocked);
  useEffect(() => {
    const f = () => setU(true);
    unlockListeners.add(f);
    return () => {
      unlockListeners.delete(f);
    };
  }, []);
  return u;
}

/** "Tap once for sound", shown only while something wants to play and cannot. */
export function SoundPrompt({ needed }: { needed: boolean }) {
  const u = useUnlocked();
  const muted = useMuted();
  if (!needed || u || muted) return null;
  return (
    <button type="button" className="soundprompt" onClick={markUnlocked}>
      🔊 화면을 한 번 눌러 소리 켜기
    </button>
  );
}

/* ---- slides -------------------------------------------------------------- */

interface Layer {
  key: string;
  slide: SlideOnAir;
  leaving: boolean;
}

const OUT_MS = 650;

function slideKey(s: SlideOnAir | null): string | null {
  return s ? `${s.cueId}|${s.media}|${s.title}|${s.body}` : null;
}

export function SlideLayer({
  slide,
  kicker,
  onVideo,
  onBlocked,
}: {
  slide: SlideOnAir | null;
  /** The small line above a placeholder title (the event's name). */
  kicker: string;
  /** A video slide is playing (true) or not (false) — the BGM waits for it. */
  onVideo(playing: boolean): void;
  /** Sound was refused until someone taps the screen. */
  onBlocked(): void;
}) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const key = slideKey(slide);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    setLayers((prev) => {
      const current = prev.find((l) => !l.leaving);
      // Same slide, new state (시작 pressed): update it in place, no transition.
      if (current?.key === key) return slide ? prev.map((l) => (l === current ? { ...l, slide } : l)) : prev;
      const out = prev.map((l) => ({ ...l, leaving: true }));
      // A cut leaves at once; everything else animates out underneath the new one.
      const cut = slide?.transition === 'cut' || current?.slide.transition === 'cut';
      const kept = cut ? [] : out;
      const next = slide && key ? [...kept, { key, slide, leaving: false }] : kept;
      return next;
    });
    const t = window.setTimeout(() => setLayers((prev) => prev.filter((l) => !l.leaving)), OUT_MS + 50);
    timers.current.push(t);
    if (!slide || !isVideo(slide.media)) onVideo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slide?.playing, slide?.startedAt]);

  return (
    <>
      {layers.map((l) => (
        <div
          key={l.key}
          className={`slide slide--${l.slide.transition}${l.leaving ? ' is-leaving' : ''}`}
          aria-hidden={l.leaving}
        >
          <SlideBody slide={l.slide} kicker={kicker} live={!l.leaving} onVideo={onVideo} onBlocked={onBlocked} />
        </div>
      ))}
    </>
  );
}

function SlideBody({
  slide,
  kicker,
  live,
  onVideo,
  onBlocked,
}: {
  slide: SlideOnAir;
  kicker: string;
  live: boolean;
  onVideo(playing: boolean): void;
  onBlocked(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const u = useUnlocked();
  const muted = useMuted();
  const [broken, setBroken] = useState(false);

  // A video waits on its first frame until the master presses 시작; then it
  // plays from the top, with sound once the page may make sound (until then, muted).
  const go = live && slide.playing;
  useEffect(() => {
    const v = video.current;
    if (!v || !live) return;
    if (!go) {
      v.pause();
      v.currentTime = 0;
      onVideo(false);
      return;
    }
    v.currentTime = 0;
    v.muted = !u || muted;
    v.play()
      .then(() => onVideo(true))
      .catch(() => {
        v.muted = true;
        onBlocked();
        void v.play().then(() => onVideo(true)).catch(() => {});
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, slide.startedAt]);

  // Sound allowed mid-video (someone tapped): unmute without restarting.
  useEffect(() => {
    const v = video.current;
    if (v && go) v.muted = !u || muted;
  }, [u, go, muted]);

  useEffect(() => {
    if (!live) video.current?.pause();
  }, [live]);

  if (slide.layout === 'rules') return <RulesSlide slide={slide} />;
  if (!slide.media || broken) {
    return (
      <div className="slide__ph">
        <div className="slide__phglow" aria-hidden="true" />
        {kicker ? <p className="slide__kicker">{kicker}</p> : null}
        <h1 className="slide__title">{slide.title}</h1>
        {slide.body ? <p className="slide__body">{slide.body}</p> : null}
      </div>
    );
  }
  if (isVideo(slide.media)) {
    return (
      <video
        ref={video}
        className="slide__media"
        src={slide.media}
        playsInline
        preload="auto"
        onEnded={() => onVideo(false)}
        onError={() => setBroken(true)}
      />
    );
  }
  return <img className="slide__media" src={slide.media} alt={slide.title} onError={() => setBroken(true)} />;
}

/* ---- BGM ----------------------------------------------------------------- */

const FADE_MS = 700;

/**
 * Plays the master's BGM. A new track (or a restart) fades the old one out and
 * the new one in; pause and stop fade out. Held silent while a video slide
 * plays, so the BGM starts as the video ends (the script's "영상과 이어지게").
 */
export function BgmPlayer({ bgm, hold, onBlocked }: { bgm: BgmOnAir | null; hold: boolean; onBlocked(): void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<number | null>(null);
  const track = useRef<string | null>(null);
  const u = useUnlocked();
  const muted = useMuted();

  const ramp = (to: number, then?: () => void) => {
    const a = audio.current;
    if (!a) return;
    if (fade.current !== null) window.clearInterval(fade.current);
    const from = a.volume;
    const start = performance.now();
    fade.current = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / FADE_MS);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) {
        window.clearInterval(fade.current!);
        fade.current = null;
        then?.();
      }
    }, 30);
  };

  useEffect(() => {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.loop = true;
      audio.current.preload = 'auto';
    }
    return () => {
      try {
        audio.current?.pause();
      } catch {
        /* no media support (tests) */
      }
      if (fade.current !== null) window.clearInterval(fade.current);
    };
  }, []);

  const want = bgm && bgm.url && bgm.playing && !hold && !muted ? bgm : null;
  const trackKey = bgm && bgm.url ? `${bgm.url}|${bgm.startedAt}` : null;
  const volume = bgm?.volume ?? 0.8;

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const start = () => {
      a.volume = 0;
      a.play()
        .then(() => ramp(volume))
        .catch(() => onBlocked());
    };
    if (trackKey !== track.current) {
      // A different track (or 처음부터): fade the old out, then load the new.
      const load = () => {
        track.current = trackKey;
        if (!trackKey || !bgm) {
          a.pause();
          a.removeAttribute('src');
          return;
        }
        a.src = bgm.url;
        a.currentTime = 0;
        if (want) start();
      };
      if (!a.paused) ramp(0, load);
      else load();
      return;
    }
    if (want) {
      if (a.paused) start();
      else ramp(volume);
    } else if (!a.paused) {
      ramp(0, () => a.pause());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, !!want, volume, u]);

  return null;
}

/**
 * The CC BY credit for the track that just started, like a TV "now playing":
 * a small line in the corner for 8 seconds, then gone.
 */
export function MusicCredit({ bgm, muted }: { bgm: BgmOnAir | null; muted: boolean }) {
  const credit = bgm && bgm.playing && !muted ? musicCredit(bgm.url) : null;
  const key = credit ? `${bgm!.url}|${bgm!.startedAt}` : null;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !credit) return undefined;
    setShown(credit);
    const t = window.setTimeout(() => setShown(null), 8000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!shown) return null;
  return (
    <div className="musiccredit" aria-hidden="true">
      {shown}
    </div>
  );
}

/**
 * 게임 방식 · 우승 조건: the rules as three numbered lines (the cue's body, split on
 * " · ") under the six stones drawn exactly like the game board.
 */
function RulesSlide({ slide }: { slide: SlideOnAir }) {
  const lines = slide.body.split(' · ').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="rules">
      <div className="rules__glow" aria-hidden="true" />
      <h1 className="rules__title">게임 방식</h1>
      <ul className="rules__stones" aria-label="6개의 스톤">
        {DEFAULT_STONES.map((name, i) => (
          <li key={name} className="rules__stone" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            <Gem color={STONE_COLORS[i % STONE_COLORS.length]!} size={110} halo />
            <span>{name}</span>
          </li>
        ))}
      </ul>
      <ol className="rules__list">
        {lines.map((l, i) => (
          <li key={i} className="rules__line" style={{ animationDelay: `${0.9 + i * 0.35}s` }}>
            <b>{i + 1}</b>
            <span>{l}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
