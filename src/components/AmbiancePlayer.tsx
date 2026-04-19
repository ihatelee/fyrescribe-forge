import { useRef, useEffect, useState } from "react";
import { Play, Pause, SpeakerHigh } from "@phosphor-icons/react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

const VOLUME_KEY = "fyrescribe_ambiance_volume";

const TRACKS: Record<ThemeName, { url: string; credit: string }> = {
  outrun:    { url: "http://www.nihilore.com/s/Motion-Blur.mp3",                                    credit: "Nihilore" },
  midnight:  { url: "https://cdn.freesound.org/previews/521/521919_2437358-lq.mp3",                 credit: "Night ambiance" },
  fireside:  { url: "https://cdn.freesound.org/previews/476/476178_9639200-lq.mp3",                 credit: "Crackling fire" },
  enchanted: { url: "https://cdn.freesound.org/previews/456/456440_5121236-lq.mp3",                 credit: "Forest ambiance" },
  daylight:  { url: "https://cdn.freesound.org/previews/456/456440_5121236-lq.mp3",                 credit: "Forest ambiance" },
  lavender:  { url: "https://cdn.freesound.org/previews/531/531947_3797507-lq.mp3",                 credit: "Gentle rain" },
};

const readVolume = (): number => {
  const saved = localStorage.getItem(VOLUME_KEY);
  return saved !== null ? Number(saved) : 0.05;
};

const AmbiancePlayer = () => {
  const { theme } = useTheme();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readVolume);

  // Swap track on theme change without autoplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = playing;
    audio.pause();
    audio.src = TRACKS[theme]?.url ?? TRACKS.midnight.url;
    audio.load();
    if (wasPlaying) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
    // playing intentionally excluded to avoid loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const isOutrun = theme === "outrun";
  const accentVar = isOutrun ? "var(--neon-yellow)" : "var(--gold)";
  const accent = `hsl(${accentVar})`;
  const accentFaint = `hsl(${accentVar} / 0.2)`;
  const track = TRACKS[theme] ?? TRACKS.midnight;

  return (
    <div className="px-2 pb-2">
      <audio ref={audioRef} src={track.url} loop preload="none" />
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
          ♪ {track.credit}
        </div>
      </div>
    </div>
  );
};

export default AmbiancePlayer;
