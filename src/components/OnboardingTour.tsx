import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

/* ── Step schema (data-driven) ─────────────────────────────────────────
   Edit copy / targets / placement here. Each `target` is a CSS selector,
   typically a `[data-tour="..."]` anchor placed on a real UI element.
   If the target isn't found, the step renders as a centered modal card. */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector for the element to spotlight. Omit for centered card. */
  target?: string;
  /** Preferred tooltip placement. Auto-flips if it would clip. */
  placement?: "top" | "bottom" | "left" | "right";
}

export const ONBOARDING_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Fyrescribe",
    body: "A quick five-step tour. Whether you're new to writing or coming from Scrivener or Notion, you'll feel at home in a minute.",
  },
  {
    id: "story-setup",
    title: "Your story lives here",
    body: "Each project is one story — manuscript, world, timeline, the lot. Switch projects any time from the logo up top.",
    target: '[data-tour="project-title"]',
    placement: "bottom",
  },
  {
    id: "world-building",
    title: "Build your world",
    body: "Characters, places, factions, magic — track every detail. Fyrescribe links them automatically as you write.",
    target: '[data-tour="world-nav"]',
    placement: "right",
  },
  {
    id: "writing-editor",
    title: "Write without distraction",
    body: "A clean editor with auto-save, focus mode, and inline scene titles. Just start typing.",
    target: '[data-tour="editor"]',
    placement: "left",
  },
  {
    id: "ai-tools",
    title: "AI does the busywork",
    body: "Sync Lore extracts new world details from your scenes. Continuity check flags contradictions. You stay in control.",
    target: '[data-tour="ai-tools"]',
    placement: "right",
  },
  {
    id: "organization",
    title: "Stay organized",
    body: "Chapters and scenes live on the right. Drag, rename, and outline as you go.",
    target: '[data-tour="chapter-panel"]',
    placement: "left",
  },
];

interface OnboardingTourProps {
  steps?: TourStep[];
  onFinish: () => void;
  onSkip: () => void;
}

const PADDING = 8;
const TOOLTIP_W = 340;
const TOOLTIP_H_EST = 200;
const VIEWPORT_MARGIN = 16;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const OnboardingTour = ({
  steps = ONBOARDING_STEPS,
  onFinish,
  onSkip,
}: OnboardingTourProps) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  /* Track viewport */
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Measure target whenever step / viewport changes. Re-measures on resize
     and via a polling fallback so it picks up late-mounting elements. */
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target!) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        // Bring into view if needed
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      } else if (attempts < 20) {
        attempts++;
        setTimeout(measure, 100);
      } else {
        setRect(null); // fallback to centered card
      }
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [step.target, index]);

  /* Keyboard navigation */
  const next = useCallback(() => {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }, [isLast, onFinish]);
  const back = useCallback(() => {
    if (!isFirst) setIndex((i) => i - 1);
  }, [isFirst]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onSkip]);

  /* Compute tooltip position */
  const computeTooltipPos = (): { top: number; left: number; centered: boolean } => {
    if (!rect) {
      return { top: 0, left: 0, centered: true };
    }
    if (isMobile) {
      // On mobile: pin to bottom of viewport for readability
      return {
        top: window.innerHeight - TOOLTIP_H_EST - VIEWPORT_MARGIN,
        left: VIEWPORT_MARGIN,
        centered: false,
      };
    }

    const placement = step.placement ?? "bottom";
    let top = 0;
    let left = 0;

    switch (placement) {
      case "right":
        top = rect.top + rect.height / 2 - TOOLTIP_H_EST / 2;
        left = rect.left + rect.width + PADDING + 4;
        break;
      case "left":
        top = rect.top + rect.height / 2 - TOOLTIP_H_EST / 2;
        left = rect.left - TOOLTIP_W - PADDING - 4;
        break;
      case "top":
        top = rect.top - TOOLTIP_H_EST - PADDING - 4;
        left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
        break;
      case "bottom":
      default:
        top = rect.top + rect.height + PADDING + 4;
        left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    }

    // Clamp into viewport
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_W - VIEWPORT_MARGIN));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - TOOLTIP_H_EST - VIEWPORT_MARGIN));

    return { top, left, centered: false };
  };

  const pos = computeTooltipPos();

  /* SVG mask for spotlight cutout */
  const spotlightCutout = rect && (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 9998 }}
      aria-hidden
    >
      <defs>
        <mask id="onboarding-spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={rect.left - PADDING}
            y={rect.top - PADDING}
            width={rect.width + PADDING * 2}
            height={rect.height + PADDING * 2}
            rx={8}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="hsl(0 0% 0% / 0.72)"
        mask="url(#onboarding-spotlight-mask)"
      />
      {/* Glowing ring around spotlight */}
      <rect
        x={rect.left - PADDING}
        y={rect.top - PADDING}
        width={rect.width + PADDING * 2}
        height={rect.height + PADDING * 2}
        rx={8}
        fill="none"
        stroke="hsl(var(--gold))"
        strokeWidth={2}
        style={{ filter: "drop-shadow(0 0 12px hsl(var(--gold)))" }}
      />
    </svg>
  );

  /* Full-screen dim if no target */
  const fullDim = !rect && (
    <div
      className="fixed inset-0 bg-black/70"
      style={{ zIndex: 9998 }}
      aria-hidden
    />
  );

  return (
    <>
      {spotlightCutout}
      {fullDim}

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="fixed bg-fyrescribe-raised border border-gold/30 rounded-xl shadow-2xl p-5"
        style={
          pos.centered
            ? {
                zIndex: 9999,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: `min(${TOOLTIP_W}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
              }
            : {
                zIndex: 9999,
                top: pos.top,
                left: pos.left,
                width: `min(${TOOLTIP_W}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
              }
        }
      >
        {/* Skip (X) — top right */}
        <button
          onClick={onSkip}
          aria-label="Skip tour"
          className="absolute top-3 right-3 text-text-dimmed hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>

        {/* Step counter */}
        <div className="text-[10px] uppercase tracking-widest text-gold mb-2">
          Step {index + 1} of {steps.length}
        </div>

        <h2
          id="onboarding-title"
          className="font-display text-lg text-foreground mb-2 pr-6"
        >
          {step.title}
        </h2>
        <p
          id="onboarding-body"
          className="text-sm text-text-secondary leading-relaxed mb-5"
        >
          {step.body}
        </p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 rounded-full transition-all ${
                i === index
                  ? "bg-gold w-6"
                  : i < index
                  ? "bg-gold/40 w-1.5"
                  : "bg-border w-1.5"
              }`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="text-xs text-text-dimmed hover:text-text-secondary transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={back}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="px-4 py-1.5 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors"
            >
              {isLast ? "Start Writing" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnboardingTour;
