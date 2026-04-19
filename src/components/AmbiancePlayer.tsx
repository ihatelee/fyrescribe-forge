import { useRef, useEffect, useState } from "react";
import { Play, Pause, SpeakerHigh } from "@phosphor-icons/react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

const VOLUME_KEY = "fyrescribe_ambiance_volume";

// Track URLs per theme. Add CDN mp3 URLs here when ready.
// An empty array means the player stays hidden for that theme.
const PLAYLISTS: Record<ThemeName, string[]> = {
  outrun:    ["http://www.nihilore.com/s/Motion-Blur.mp3"],
  midnight:  [],
  fireside:  [],
  enchanted: [],
  daylight:  [],
  lavender:  [],
};

const readVolume = (): number => {
  const saved = localStorage.getItem(VOLUME_KEY);
  return saved !== null ? Number(saved) : 0.05;
};

const AmbiancePlayer = () => {
  const { theme } = useTheme();
  const tracks = PLAYLISTS[theme] ?? [];
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readVolume);

  // Swap playlist on theme change — reset to track 0, don't autoplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setTrackIndex(0);
    setPlaying(false);
    audio.pause();
    if (tracks[0]) {
      audio.src = tracks[0];
      audio.load();
    }
    // tracks identity changes with theme; playing excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Advance to next track when current one ends
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

  // No tracks for this theme — render nothing
  if (!tracks.length) return null;

  const isOutrun = theme === "outrun";
  const accentVar = isOutrun ? "var(--neon-yellow)" : "var(--gold)";
  const accent = `hsl(${accentVar})`;
  const accentFaint = `hsl(${accentVar} / 0.2)`;

  return (
    <div className="px-2 pb-2">
      <audio ref={audioRef} src={tracks[0]} preload="none" onEnded={handleEnded} />
      <div
        className="rounded px-2 py-2 space-y-2"
        style={{
          background: "hsl(var(--bg-raised))",
          border: `1px solid hsl(${accentVar} / 0.25)`,
          boxShadow: `0 0 10px hsl(${accentVar} / 0.06)`,
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause ambiance" : "Play ambiance"}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-all"
            style={{
              color: accent,
              border: `1px solid hsl(${accentVar} / 0.5)`,
              background: `hsl(${accentVar} / 0.08)`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `hsl(${accentVar} / 0.18)`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = `hsl(${accentVar} / 0.08)`)}
          >
            {playing ? <Pause size={9} weight="fill" /> : <Play size={9} weight="fill" />}
          </button>

          <SpeakerHigh
            size={10}
            weight="duotone"
            className="flex-shrink-0"
            style={{ color: `hsl(${accentVar} / 0.55)` }}
          />

          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 min-w-0 h-[3px] cursor-pointer rounded appearance-none"
            style={{
              accentColor: accent,
              background: `linear-gradient(to right, ${accent} ${volume * 100}%, ${accentFaint} ${volume * 100}%)`,
            }}
            aria-label="Ambiance volume"
          />
        </div>

        <div
          className="text-[9px] tracking-widest"
          style={{ color: `hsl(${accentVar} / 0.45)`, fontFamily: "var(--font-body)" }}
        >
          ♪ {isOutrun ? "Nihilore" : `Track ${trackIndex + 1} / ${tracks.length}`}
        </div>
      </div>
    </div>
  );
};

export default AmbiancePlayer;
