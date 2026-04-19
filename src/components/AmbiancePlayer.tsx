import { useRef, useEffect, useState } from "react";
import { Play, Pause, SpeakerHigh } from "@phosphor-icons/react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

const VOLUME_KEY = "fyrescribe_ambiance_volume";

// Soundscape tracks per theme.
// Files live in the public `soundscapes` storage bucket.
// To add/swap a track: upload an MP3 to the bucket via the backend UI,
// then ensure the file name matches `{theme}.mp3`.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const bucketUrl = (file: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/soundscapes/${file}`;

type Track = { src: string; credit: string };

const TRACKS: Record<ThemeName, Track> = {
  outrun:    { src: "http://www.nihilore.com/s/Motion-Blur.mp3", credit: "♪ Nihilore" },
  midnight:  { src: bucketUrl("AmbienceForest MIX64_09.mp3"),       credit: "♪ Untitled" },
  fireside:  { src: bucketUrl("Fireplace With Night Ambience.mp3"), credit: "♪ Untitled" },
  lavender:  { src: bucketUrl("Nature Rain.mp3"),                   credit: "♪ Untitled" },
  enchanted: { src: bucketUrl("Nature.mp3"),                        credit: "♪ Untitled" },
  daylight:  { src: bucketUrl("soundjay_nature_main-01.mp3"),       credit: "♪ Untitled" },
};

const readVolume = (): number => {
  const saved = localStorage.getItem(VOLUME_KEY);
  return saved !== null ? Number(saved) : 0.05;
};

/**
 * Compact horizontal ambiance player for the titlebar.
 *
 * Behaviour:
 * - Hidden when the active theme has no playlist OR the user disabled Soundscape.
 * - Auto-plays on theme switch when Soundscape is on (browser may block first attempt).
 * - Toggling Soundscape off pauses immediately; toggling back on resumes if a track exists.
 * - Volume persisted to localStorage.
 */
const AmbiancePlayer = () => {
  const { theme, soundscape } = useTheme();
  const track = TRACKS[theme];
  const hasTrack = !!track?.src;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readVolume);

  // Theme change → load new track and (if soundscape on) try to autoplay.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasTrack) return;
    audio.src = track.src;
    audio.load();
    if (soundscape) {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Soundscape toggle changes: pause immediately when turned off, resume when turned on.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasTrack) return;
    if (!soundscape) {
      audio.pause();
      setPlaying(false);
    } else if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundscape]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !hasTrack) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (!audio.src) {
        audio.src = track.src;
        audio.load();
      }
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  // Hide when the user disabled the soundscape or this theme has no track
  if (!hasTrack || !soundscape) return null;

  const isOutrun = theme === "outrun";
  const accentVar = isOutrun ? "var(--neon-yellow)" : "var(--gold)";
  const accent = `hsl(${accentVar})`;
  const accentFaint = `hsl(${accentVar} / 0.2)`;

  return (
    <div
      className="hidden md:flex items-center gap-2 h-7 px-2 rounded-full"
      style={{
        background: "hsl(var(--bg-raised))",
        border: `1px solid hsl(${accentVar} / 0.35)`,
        boxShadow: `0 0 10px hsl(${accentVar} / 0.06)`,
      }}
    >
      <audio ref={audioRef} src={track.src} preload="none" loop />

      <button
        onClick={togglePlay}
        aria-label={playing ? "Pause ambiance" : "Play ambiance"}
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full transition-colors"
        style={{
          color: accent,
          background: `hsl(${accentVar} / 0.12)`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = `hsl(${accentVar} / 0.22)`)}
        onMouseLeave={(e) => (e.currentTarget.style.background = `hsl(${accentVar} / 0.12)`)}
      >
        {playing ? <Pause size={9} weight="fill" /> : <Play size={9} weight="fill" />}
      </button>

      <SpeakerHigh
        size={11}
        weight="duotone"
        className="flex-shrink-0"
        style={{ color: `hsl(${accentVar} / 0.6)` }}
      />

      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-20 h-[3px] cursor-pointer rounded appearance-none"
        style={{
          accentColor: accent,
          background: `linear-gradient(to right, ${accent} ${volume * 100}%, ${accentFaint} ${volume * 100}%)`,
        }}
        aria-label="Ambiance volume"
      />

      <span
        className="text-[9px] tracking-widest whitespace-nowrap"
        style={{ color: `hsl(${accentVar} / 0.55)`, fontFamily: "var(--font-body)" }}
      >
        {track.credit}
      </span>
    </div>
  );
};

export default AmbiancePlayer;
