import { useEffect, useId } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { PARCHMENT_B64, GHOST_B64 } from "@/lib/whimsicalTextures";

// Sets --w-parchment CSS custom property so index.css rules can reference the
// PNG data URL in pseudo-element background-image without a TypeScript import.
function useWhimsicalVars(active: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (active) {
      root.style.setProperty(
        "--w-parchment",
        `url("data:image/png;base64,${PARCHMENT_B64}")`,
      );
    } else {
      root.style.removeProperty("--w-parchment");
    }
  }, [active]);
}

const WhimsicalOverlay = () => {
  const { whimsical, theme } = useTheme();
  const rawId = useId();
  const uid = rawId.replace(/:/g, "w");

  const active = whimsical && theme !== "outrun";
  useWhimsicalVars(active);

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[2] hidden md:block" aria-hidden="true">

      {/* 1. Vignette — stronger radial candlelight falloff */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 110% at 50% 44%, transparent 14%, rgba(0,0,0,0.58) 100%)",
        }}
      />

      {/* 2. Parchment grain — SVG feTurbulence at very low opacity */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.045 }}>
        <defs>
          <filter id={`${uid}-noise`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="4"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${uid}-noise)`} fill="white" />
      </svg>

      {/* 3. Ghost background texture — faint manuscript-page marks at 4% opacity */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/png;base64,${GHOST_B64}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
          opacity: 0.04,
        }}
      />

    </div>
  );
};

export default WhimsicalOverlay;
