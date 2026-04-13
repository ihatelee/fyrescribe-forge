import { useRef, useEffect, useState } from "react";
import { Play, Pause, SpeakerHigh } from "@phosphor-icons/react";

// OUTRUN_MUSIC_URL — swap this constant to change the background track
const OUTRUN_MUSIC_URL = "http://www.nihilore.com/s/Motion-Blur.mp3";

const OutrunMusicPlayer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);

  // Auto-play on mount (this component only renders when outrun theme is active).
  // On unmount (theme changed away), the audio element is destroyed and playback stops.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => {
        // Autoplay blocked by browser — show player in paused state
        setPlaying(false);
      });
    return () => {
      audio.pause();
    };
    // volume intentionally excluded: initial volume is set here, changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
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

  const trackFill = `hsl(var(--gold))`;
  const trackEmpty = `hsl(var(--gold) / 0.2)`;

  return (
    <div className="px-2 pb-2">
      <audio ref={audioRef} src={OUTRUN_MUSIC_URL} loop preload="none" />
      <div
        className="rounded px-2 py-2 space-y-2"
        style={{
          background: "hsl(var(--bg-raised))",
          border: "1px solid hsl(var(--gold) / 0.25)",
          boxShadow: "0 0 10px hsl(var(--gold) / 0.06)",
        }}
      >
        {/* Controls row */}
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-all"
            style={{
              color: "hsl(var(--gold))",
              border: "1px solid hsl(var(--gold) / 0.4)",
              background: "hsl(var(--gold) / 0.08)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "hsl(var(--gold) / 0.18)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "hsl(var(--gold) / 0.08)")
            }
          >
            {playing ? (
              <Pause size={9} weight="fill" />
            ) : (
              <Play size={9} weight="fill" />
            )}
          </button>

          {/* Volume icon */}
          <SpeakerHigh
            size={10}
            weight="duotone"
            className="flex-shrink-0"
            style={{ color: "hsl(var(--gold) / 0.55)" }}
          />

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 min-w-0 h-[3px] cursor-pointer rounded appearance-none"
            style={{
              accentColor: trackFill,
              background: `linear-gradient(to right, ${trackFill} ${volume * 100}%, ${trackEmpty} ${volume * 100}%)`,
            }}
            aria-label="Volume"
          />
        </div>

        {/* Credit */}
        <div
          className="text-[9px] tracking-widest"
          style={{ color: "hsl(var(--gold) / 0.45)", fontFamily: "var(--font-body)" }}
        >
          ♪ Nihilore
        </div>
      </div>
    </div>
  );
};

export default OutrunMusicPlayer;
