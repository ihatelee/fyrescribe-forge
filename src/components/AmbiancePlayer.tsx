import { Play, Pause, SpeakerHigh } from "@phosphor-icons/react";
import { useTheme } from "@/contexts/ThemeContext";
import { ambianceStore, useAmbianceState } from "@/lib/ambianceStore";
import { getTrackForTheme } from "./AmbianceAudioHost";

/**
 * Compact horizontal ambiance player UI for the titlebar.
 *
 * This component is purely presentational/control: the actual <audio>
 * element lives in <AmbianceAudioHost /> at the App root so playback
 * survives route changes. We read state from the singleton ambianceStore
 * and dispatch volume changes back into it.
 */
const AmbiancePlayer = () => {
  const { theme, soundscape } = useTheme();
  const track = getTrackForTheme(theme);
  const hasTrack = !!track?.src;
  const { playing, targetVolume } = useAmbianceState();

  // Hide when the user disabled the soundscape or this theme has no track.
  if (!hasTrack || !soundscape) return null;

  const togglePlay = () => {
    // Find the audio element rendered by the host and toggle it directly.
    const audio = document.querySelector<HTMLAudioElement>("audio[data-ambiance-host]");
    if (!audio) return;
    if (playing) {
      audio.pause();
      ambianceStore.set({ playing: false });
    } else {
      audio.play().then(() => ambianceStore.set({ playing: true })).catch(() => {});
    }
  };

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
        value={targetVolume}
        onChange={(e) => ambianceStore.set({ targetVolume: Number(e.target.value) })}
        className="w-20 h-[3px] cursor-pointer rounded appearance-none"
        style={{
          accentColor: accent,
          background: `linear-gradient(to right, ${accent} ${targetVolume * 100}%, ${accentFaint} ${targetVolume * 100}%)`,
        }}
        aria-label="Ambiance volume"
      />

      {isOutrun && track.credit && (
        <span
          className="text-[9px] tracking-widest whitespace-nowrap"
          style={{ color: `hsl(${accentVar} / 0.55)`, fontFamily: "var(--font-body)" }}
        >
          {track.credit}
        </span>
      )}
    </div>
  );
};

export default AmbiancePlayer;
