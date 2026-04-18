import { useId } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/* ─── Ink Blot ───────────────────────────────────────────────────────────── */

interface InkBlotProps {
  uid: string;
  x: string;
  y: string;
  w: number;
  h: number;
  rot: number;
  opacity: number;
  seed: number;
}

const InkBlot = ({ uid, x, y, w, h, rot, opacity, seed }: InkBlotProps) => {
  const fid = `${uid}-blot${seed}`;
  return (
    <svg
      className="absolute"
      style={{ left: x, top: y, width: w, height: h, opacity }}
      overflow="visible"
    >
      <defs>
        <filter id={fid}>
          <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="3" seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale="10" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w * 0.40}
        ry={h * 0.38}
        transform={`rotate(${rot} ${w / 2} ${h / 2})`}
        filter={`url(#${fid})`}
        style={{ fill: "hsl(var(--foreground))" }}
      />
    </svg>
  );
};

/* ─── Corner Flourish ────────────────────────────────────────────────────── */

type Corner = "top-left" | "bottom-right";

const CornerFlourish = ({ corner }: { corner: Corner }) => {
  const isTopLeft = corner === "top-left";
  const posStyle: React.CSSProperties = isTopLeft
    ? { top: 20, left: 200 }   // left offset accounts for sidebar width on desktop
    : { bottom: 20, right: 8 };

  return (
    <svg
      className="absolute hidden lg:block"
      style={{ ...posStyle, width: 80, height: 80, opacity: 0.55 }}
      viewBox="0 0 80 80"
      overflow="visible"
      aria-hidden="true"
    >
      {isTopLeft ? (
        <g style={{ stroke: "hsl(var(--gold))", fill: "none", strokeLinecap: "round" }}>
          {/* Outer bracket — right along top, down on left */}
          <path d="M 4,76 L 4,12 Q 4,4 12,4 L 76,4" strokeWidth="1.5" />
          {/* Inner echo line */}
          <path d="M 4,66 L 4,12 Q 4,4 12,4 L 66,4" strokeWidth="0.7" style={{ opacity: 0.5 }} />
          {/* Corner diamond ornament */}
          <path d="M 4,0 L 8,4 L 4,8 L 0,4 Z" style={{ fill: "hsl(var(--gold))" }} />
          {/* Tick marks along horizontal */}
          <line x1="28" y1="4" x2="28" y2="10" strokeWidth="1.2" />
          <line x1="48" y1="4" x2="48" y2="7" strokeWidth="0.8" style={{ opacity: 0.55 }} />
          {/* Tick marks along vertical */}
          <line x1="4" y1="28" x2="10" y2="28" strokeWidth="1.2" />
          <line x1="4" y1="48" x2="7" y2="48" strokeWidth="0.8" style={{ opacity: 0.55 }} />
          {/* Terminal dots at bracket ends */}
          <circle cx="76" cy="4" r="2.5" style={{ fill: "hsl(var(--gold))" }} />
          <circle cx="4" cy="76" r="2.5" style={{ fill: "hsl(var(--gold))" }} />
        </g>
      ) : (
        <g style={{ stroke: "hsl(var(--gold))", fill: "none", strokeLinecap: "round" }}>
          {/* Outer bracket — left along bottom, up on right */}
          <path d="M 76,4 L 76,68 Q 76,76 68,76 L 4,76" strokeWidth="1.5" />
          {/* Inner echo line */}
          <path d="M 76,14 L 76,68 Q 76,76 68,76 L 14,76" strokeWidth="0.7" style={{ opacity: 0.5 }} />
          {/* Corner diamond */}
          <path d="M 76,80 L 80,76 L 76,72 L 72,76 Z" style={{ fill: "hsl(var(--gold))" }} />
          {/* Tick marks along horizontal bottom */}
          <line x1="52" y1="76" x2="52" y2="70" strokeWidth="1.2" />
          <line x1="32" y1="76" x2="32" y2="73" strokeWidth="0.8" style={{ opacity: 0.55 }} />
          {/* Tick marks along vertical right */}
          <line x1="76" y1="52" x2="70" y2="52" strokeWidth="1.2" />
          <line x1="76" y1="32" x2="73" y2="32" strokeWidth="0.8" style={{ opacity: 0.55 }} />
          {/* Terminal dots */}
          <circle cx="4" cy="76" r="2.5" style={{ fill: "hsl(var(--gold))" }} />
          <circle cx="76" cy="4" r="2.5" style={{ fill: "hsl(var(--gold))" }} />
        </g>
      )}
    </svg>
  );
};

/* ─── Frayed Page Edge ───────────────────────────────────────────────────── */

const PageEdge = ({ uid, side }: { uid: string; side: "left" | "right" }) => {
  const gradId = `${uid}-edge-grad-${side}`;
  const filtId = `${uid}-edge-filt-${side}`;
  const isLeft = side === "left";
  const gradAttrs = isLeft
    ? { x1: "0%", y1: "0%", x2: "100%", y2: "0%" }
    : { x1: "100%", y1: "0%", x2: "0%", y2: "0%" };

  return (
    <svg
      className="absolute top-0 h-full"
      style={{ [isLeft ? "left" : "right"]: 0, width: 56, opacity: 0.3 }}
      preserveAspectRatio="none"
    >
      <defs>
        <filter id={filtId}>
          <feTurbulence
            type="turbulence"
            baseFrequency="0.012 0.18"
            numOctaves="4"
            seed={isLeft ? 5 : 11}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <linearGradient id={gradId} {...gradAttrs}>
          <stop offset="0%" style={{ stopColor: "hsl(var(--background))", stopOpacity: 0.9 }} />
          <stop offset="60%" style={{ stopColor: "hsl(var(--background))", stopOpacity: 0.4 }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--background))", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect width="56" height="100%" style={{ fill: `url(#${gradId})` }} filter={`url(#${filtId})`} />
    </svg>
  );
};

/* ─── Scroll Curl ────────────────────────────────────────────────────────── */

const ScrollCurl = () => (
  <svg
    className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden lg:block"
    width="460"
    height="44"
    viewBox="0 0 460 44"
    style={{ opacity: 0.22 }}
  >
    {/* Main curl wave */}
    <path
      d="M 0,32 C 60,10 100,34 150,22 C 200,10 230,28 280,20 C 330,12 380,30 420,22 C 434,19 448,24 460,32"
      style={{ stroke: "hsl(var(--gold))", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}
    />
    {/* Shadow echo */}
    <path
      d="M 0,36 C 60,14 100,38 150,26 C 200,14 230,32 280,24 C 330,16 380,34 420,26 C 434,23 448,28 460,36"
      style={{ stroke: "hsl(var(--gold))", fill: "none", strokeWidth: 0.7, opacity: 0.45, strokeLinecap: "round" }}
    />
    {/* End terminal circles */}
    <circle cx="0" cy="32" r="2.5" style={{ fill: "hsl(var(--gold))", opacity: 0.7 }} />
    <circle cx="460" cy="32" r="2.5" style={{ fill: "hsl(var(--gold))", opacity: 0.7 }} />
    {/* Midpoint accent */}
    <circle cx="230" cy="20" r="1.5" style={{ fill: "hsl(var(--gold))", opacity: 0.5 }} />
  </svg>
);

/* ─── Main overlay ───────────────────────────────────────────────────────── */

const WhimsicalOverlay = () => {
  const { whimsical } = useTheme();
  const rawId = useId();
  const uid = rawId.replace(/:/g, "w");

  if (!whimsical) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[2]" aria-hidden="true">

      {/* 1. Vignette — radial falloff suggesting candlelight */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 130% 120% at 50% 45%, transparent 18%, rgba(0,0,0,0.48) 100%)",
        }}
      />

      {/* 2. Parchment grain — SVG feTurbulence at very low opacity */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.04 }}>
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

      {/* 3. Ink blot accents — three scattered organic spots */}
      <InkBlot uid={uid} x="7%"  y="14%" w={58} h={36} rot={-18} opacity={0.11} seed={1} />
      <InkBlot uid={uid} x="87%" y="65%" w={46} h={32} rot={22}  opacity={0.09} seed={2} />
      <InkBlot uid={uid} x="4%"  y="70%" w={38} h={28} rot={-7}  opacity={0.10} seed={4} />

      {/* 4. Corner flourishes — illuminated manuscript bracket ornaments */}
      <CornerFlourish corner="top-left" />
      <CornerFlourish corner="bottom-right" />

      {/* 5. Frayed / deckled page edges — turbulence-displaced gradient strips */}
      <PageEdge uid={uid} side="left" />
      <PageEdge uid={uid} side="right" />

      {/* 7. Scroll curl footer */}
      <ScrollCurl />

    </div>
  );
};

export default WhimsicalOverlay;
