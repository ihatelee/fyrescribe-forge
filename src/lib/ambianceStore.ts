/**
 * Module-level singleton store for the ambiance player.
 *
 * Why: The <audio> element must outlive route changes. Pages re-mount the
 * Titlebar (and therefore AmbiancePlayer UI) on navigation, which would
 * otherwise destroy the <audio> tag and restart playback. We solve this by
 * mounting a single `<AmbianceAudioHost>` at the App root that owns the
 * <audio> tag, and exposing playback state through this store so the
 * per-page UI controls can read/control it without remounting it.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

const VOLUME_KEY = "fyrescribe_ambiance_volume";

export type AmbianceState = {
  playing: boolean;
  /** User-chosen target volume 0..1 (persisted). */
  targetVolume: number;
  /** Currently audible volume 0..1 (animated during fade-in). */
  currentVolume: number;
  /** Currently loaded src (for change detection). */
  src: string | null;
};

const readSavedVolume = (): number => {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved !== null ? Number(saved) : 0.5;
  } catch {
    return 0.5;
  }
};

let state: AmbianceState = {
  playing: false,
  targetVolume: readSavedVolume(),
  currentVolume: 0,
  src: null,
};

const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export const ambianceStore = {
  get: () => state,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(patch: Partial<AmbianceState>) {
    state = { ...state, ...patch };
    if (patch.targetVolume !== undefined) {
      try {
        localStorage.setItem(VOLUME_KEY, String(patch.targetVolume));
      } catch {
        /* ignore */
      }
    }
    emit();
  },
};

/** React hook returning the live ambiance state. */
export const useAmbianceState = (): AmbianceState =>
  useSyncExternalStore(ambianceStore.subscribe, ambianceStore.get, ambianceStore.get);
