import { useEffect, useRef } from "react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { ambianceStore } from "@/lib/ambianceStore";

/**
 * Singleton audio host. Mount ONCE at the App root so the <audio> element
 * survives route changes (and music keeps playing across navigation).
 *
 * Per-theme tracks live in the public `soundscapes` storage bucket. Outrun
 * has multiple tracks that cycle (and can be skipped via the UI); every
 * other theme has a single looping track.
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

export type Track = { src: string; credit?: string };

/** Outrun playlist — cycles in order, skippable from the UI. */
const OUTRUN_PLAYLIST: Track[] = [
  { src: bucketUrl("Full Track.mp3"),         credit: "♪ Track 1" },
  { src: bucketUrl("80s Dark Synthwave.mp3"), credit: "♪ Track 2" },
  { src: bucketUrl("Cars and Sport.mp3"),     credit: "♪ Track 3" },
];

const SINGLE_TRACKS: Record<Exclude<ThemeName, "outrun">, Track> = {
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

export const getOutrunPlaylist = (): Track[] => OUTRUN_PLAYLIST;

export const getTrackForTheme = (theme: ThemeName, outrunIndex = 0): Track =>
  theme === "outrun" ? OUTRUN_PLAYLIST[outrunIndex % OUTRUN_PLAYLIST.length] : SINGLE_TRACKS[theme];

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

  /** Resolve the current track based on theme + (for outrun) playlist index. */
  const currentTrack = (): Track | null => {
    const t = currentThemeRef.current;
    if (t === "outrun") {
      const { outrunTrackIndex } = ambianceStore.get();
      return OUTRUN_PLAYLIST[outrunTrackIndex % OUTRUN_PLAYLIST.length] ?? null;
    }
    return SINGLE_TRACKS[t] ?? null;
  };

  /** Load + (optionally) play a track, applying fade-in. */
  const loadAndMaybePlay = (track: Track | null, shouldPlay: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!track?.src) {
      audio.pause();
      cancelFade();
      ambianceStore.set({ playing: false, currentVolume: 0, src: null });
      return;
    }
    audio.src = track.src;
    audio.load();
    ambianceStore.set({ src: track.src });
    if (shouldPlay) {
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
  };

  // Theme change → load new track and (if soundscape on) fade in.
  useEffect(() => {
    loadAndMaybePlay(currentTrack(), soundscape);
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

  // React to user-driven target volume changes AND outrun track skips.
  useEffect(() => {
    let lastIndex = ambianceStore.get().outrunTrackIndex;
    const unsub = ambianceStore.subscribe(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const state = ambianceStore.get();

      // Outrun: track skip → load the new playlist entry.
      if (currentThemeRef.current === "outrun" && state.outrunTrackIndex !== lastIndex) {
        lastIndex = state.outrunTrackIndex;
        loadAndMaybePlay(currentTrack(), soundscape);
        return;
      }

      // Volume snap (only if no fade is currently running).
      if (fadeRef.current !== null) return;
      const cap = themeVolumeCap(currentThemeRef.current, state.targetVolume);
      if (Math.abs(audio.volume - cap) > 0.001) {
        audio.volume = cap;
        ambianceStore.set({ currentVolume: cap });
      }
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundscape]);

  /** When a track ends, advance: outrun cycles playlist, others loop natively. */
  const handleEnded = () => {
    if (currentThemeRef.current !== "outrun") return;
    const { outrunTrackIndex } = ambianceStore.get();
    ambianceStore.set({ outrunTrackIndex: (outrunTrackIndex + 1) % OUTRUN_PLAYLIST.length });
  };

  // Outrun must NOT use the native `loop` attribute (we want `ended` to fire
  // so we can advance the playlist). All other themes loop natively.
  const isOutrun = theme === "outrun";

  return (
    <audio
      ref={audioRef}
      preload="none"
      loop={!isOutrun}
      onEnded={handleEnded}
      data-ambiance-host="true"
    />
  );
};

export default AmbianceAudioHost;
