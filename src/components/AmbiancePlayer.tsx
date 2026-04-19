import { useRef, useEffect, useState } from "react";
import { Play, Pause, SpeakerHigh } from "@phosphor-icons/react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

const VOLUME_KEY = "fyrescribe_ambiance_volume";

// Track + credit per theme.
// To add a track: drop the MP3 in `public/soundscapes/` and update the `src` below.
// Set `src: ""` to hide the player for that theme.
type Track = { src: string; credit: string };

const TRACKS: Record<ThemeName, Track> = {
  outrun:    { src: "http://www.nihilore.com/s/Motion-Blur.mp3", credit: "♪ Nihilore" },
  midnight:  { src: "/soundscapes/midnight.mp3",  credit: "♪ Untitled" },
  fireside:  { src: "/soundscapes/fireside.mp3",  credit: "♪ Untitled" },
  enchanted: { src: "/soundscapes/enchanted.mp3", credit: "♪ Untitled" },
  daylight:  { src: "/soundscapes/daylight.mp3",  credit: "♪ Untitled" },
  lavender:  { src: "/soundscapes/lavender.mp3",  credit: "♪ Untitled" },
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
  const tracks = PLAYLISTS[theme] ?? [];
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readVolume);

  // Theme change → reset to track 0 and (if soundscape on) try to autoplay.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !tracks.length) return;
    setTrackIndex(0);
    audio.src = tracks[0];
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
    if (!audio || !tracks.length) return;
    if (!soundscape) {
      audio.pause();
      setPlaying(false);
    } else if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundscape]);

  // Advance to next track when current ends
  const handleEnded = () => {
    if (!tracks.length) return;
    const next = (trackIndex + 1) % tracks.length;
    setTrackIndex(next);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = tracks[next];
    audio.load();
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !tracks.length) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (!audio.src && tracks[0]) {
        audio.src = tracks[0];
        audio.load();
      }
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  // Hide when the user disabled the soundscape or this theme has no tracks
  if (!tracks.length || !soundscape) return null;

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
      <audio ref={audioRef} src={tracks[0]} preload="none" onEnded={handleEnded} />

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
    </div>
  );
};

export default AmbiancePlayer;
