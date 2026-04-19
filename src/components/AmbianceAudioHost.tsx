import { useEffect, useRef } from "react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { ambianceStore } from "@/lib/ambianceStore";

/**
 * Singleton audio host. Mount ONCE at the App root so the <audio> element
 * survives route changes (and music keeps playing across navigation).
 *
 * Per-theme tracks live in the public `soundscapes` storage bucket; the
 * outrun track is still hosted externally.
 *
 * Volume behaviour:
 * - User picks a target volume via the titlebar UI (persisted).
 * - On every track (re)start we fade `currentVolume` from 0 → targetCap
 *   over ~5s. For outrun the cap is half the user's target (it's a much
 *   louder master) — for everything else we use the full target.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const bucketUrl = (file: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/soundscapes/${encodeURIComponent(file)}`;

type Track = { src: string; credit?: string };

const TRACKS: Record<ThemeName, Track> = {
  outrun:    { src: "http://www.nihilore.com/s/Motion-Blur.mp3", credit: "♪ Nihilore" },
  midnight:  { src: bucketUrl("AmbienceForest MIX64_09.mp3") },
  fireside:  { src: bucketUrl("Fireplace With Night Ambience.mp3") },
  lavender:  { src: bucketUrl("Nature Rain.mp3") },
  enchanted: { src: bucketUrl("Nature.mp3") },
  daylight:  { src: bucketUrl("soundjay_nature_main-01.mp3") },
};

/** Outrun is naturally much louder — cap its effective volume at 50% of target. */
const themeVolumeCap = (theme: ThemeName, target: number) =>
  theme === "outrun" ? target * 0.5 : target;

const FADE_MS = 5000;
const FADE_TICK_MS = 50;

export const getTrackForTheme = (theme: ThemeName): Track => TRACKS[theme];

const AmbianceAudioHost = () => {
  const { theme, soundscape } = useTheme();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const currentThemeRef = useRef<ThemeName>(theme);

  // Keep latest theme accessible to the fade tick.
  useEffect(() => {
    currentThemeRef.current = theme;
  }, [theme]);

  const cancelFade = () => {
    if (fadeRef.current !== null) {
      window.clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
  };

  /** Start a fade from current effective volume up to themeVolumeCap(target). */
  const startFadeIn = () => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelFade();
    const startTime = performance.now();
    const startVol = 0;
    audio.volume = startVol;
    ambianceStore.set({ currentVolume: startVol });

    fadeRef.current = window.setInterval(() => {
      const a = audioRef.current;
      if (!a) {
        cancelFade();
        return;
      }
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / FADE_MS);
      const { targetVolume } = ambianceStore.get();
      const cap = themeVolumeCap(currentThemeRef.current, targetVolume);
      const v = startVol + (cap - startVol) * t;
      a.volume = Math.max(0, Math.min(1, v));
      ambianceStore.set({ currentVolume: a.volume });
      if (t >= 1) cancelFade();
    }, FADE_TICK_MS);
  };

  // Theme change → load new track and (if soundscape on) fade in.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const track = TRACKS[theme];
    if (!track?.src) {
      audio.pause();
      cancelFade();
      ambianceStore.set({ playing: false, currentVolume: 0, src: null });
      return;
    }
    audio.src = track.src;
    audio.load();
    ambianceStore.set({ src: track.src });
    if (soundscape) {
      audio
        .play()
        .then(() => {
          ambianceStore.set({ playing: true });
          startFadeIn();
        })
        .catch(() => ambianceStore.set({ playing: false }));
    } else {
      audio.pause();
      ambianceStore.set({ playing: false });
    }
    return cancelFade;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Soundscape on/off toggle.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!soundscape) {
      audio.pause();
      cancelFade();
      ambianceStore.set({ playing: false, currentVolume: 0 });
    } else if (audio.paused && audio.src) {
      audio
        .play()
        .then(() => {
          ambianceStore.set({ playing: true });
          startFadeIn();
        })
        .catch(() => ambianceStore.set({ playing: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundscape]);

  // React to user-driven target volume changes from the UI: if a fade is
  // running it will pick up the new cap on its next tick; if no fade is
  // running, snap to the new cap immediately.
  useEffect(() => {
    const unsub = ambianceStore.subscribe(() => {
      const audio = audioRef.current;
      if (!audio || fadeRef.current !== null) return;
      const { targetVolume } = ambianceStore.get();
      const cap = themeVolumeCap(currentThemeRef.current, targetVolume);
      if (Math.abs(audio.volume - cap) > 0.001) {
        audio.volume = cap;
        ambianceStore.set({ currentVolume: cap });
      }
    });
    return () => {
      unsub();
    };
  }, []);

  return <audio ref={audioRef} preload="none" loop data-ambiance-host="true" />;
};

export default AmbianceAudioHost;
