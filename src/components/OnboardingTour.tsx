import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { X } from "lucide-react";

/* ── Step schema (data-driven) ─────────────────────────────────────────
   Each step can optionally navigate to a `route` before measuring its
   target. Tokens supported by OnboardingProvider:
     {manuscript} → /project/<active>/manuscript (or /manuscript)
     {entity}     → /entity/<first entity id>   (or /world/characters)
   Anything else is treated as a plain path. */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector for the element to spotlight. Omit for centered card. */
  target?: string;
  /** Preferred tooltip placement. Auto-flips if it would clip. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Route to navigate to before measuring this step's target. */
  route?: string;
}

export const ONBOARDING_STEPS: TourStep[] = [
  // ── Steps 1–4: Manuscript page ──
  {
    id: "welcome",
    title: "Welcome to Fyrescribe",
    body: "A quick tour of the workspace. Whether you're new to writing or coming from Scrivener or Notion, you'll feel at home in a minute.",
    route: "{manuscript}",
  },
  {
    id: "story-setup",
    title: "Your story lives here",
    body: "Each project is one story — manuscript, world, timeline, the lot. Switch projects any time from the logo up top.",
    target: '[data-tour="project-title"]',
    placement: "bottom",
    route: "{manuscript}",
  },
  {
    id: "writing-editor",
    title: "Write without distraction",
    body: "A clean editor with auto-save, focus mode, and inline scene titles. Just start typing.",
    target: '[data-tour="editor"]',
    placement: "left",
    route: "{manuscript}",
  },
  {
    id: "organization",
    title: "Stay organized",
    body: "Chapters and scenes live on the right. Drag, rename, and outline as you go.",
    target: '[data-tour="chapter-panel"]',
    placement: "left",
    route: "{manuscript}",
  },
  // ── Step 5: Notes ──
  {
    id: "notes",
    title: "Capture loose ideas",
    body: "Notes are quick scratch pads — research, character sketches, half-formed thoughts. They live alongside the manuscript.",
    target: '[data-tour="notes-panel"]',
    placement: "right",
    route: "/notes",
  },
  // ── Step 6: Timeline ──
  {
    id: "timeline",
    title: "Build a timeline",
    body: "Track world history and story events in chronological order. Drag to reorder, or generate one from your existing lore.",
    target: '[data-tour="timeline-view"]',
    placement: "top",
    route: "/timeline",
  },
  // ── Step 7: POV Tracker ──
  {
    id: "pov",
    title: "Track POV across scenes",
    body: "See which character's perspective drives each scene at a glance — useful for multi-POV novels.",
    target: '[data-tour="pov-panel"]',
    placement: "top",
    route: "/pov-tracker",
  },
  // ── Step 8: World & Lore (back on manuscript so the sidebar shows) ──
  {
    id: "world-building",
    title: "Build your world",
    body: "Characters, places, factions, magic — track every detail. Fyrescribe links them automatically as you write.",
    target: '[data-tour="world-nav"]',
    placement: "right",
    route: "{manuscript}",
  },
  // ── Step 9: Lore record form ──
  {
    id: "lore-record",
    title: "Wikipedia-style entries",
    body: "Each entry has a structured At-a-Glance panel and rich article body. Edit any field inline — changes auto-save.",
    target: '[data-tour="entity-record"]',
    placement: "left",
    route: "{entity}",
  },
  // ── Step 10: Sync buttons in sidebar ──
  {
    id: "ai-tools",
    title: "AI does the busywork",
    body: "Sync Lore extracts new world details from your scenes. Sync Mentions and Sync Connections keep everything stitched together. You stay in control.",
    target: '[data-tour="sync-buttons"]',
    placement: "right",
    route: "{manuscript}",
  },
];

interface OnboardingTourProps {
  steps?: TourStep[];
  onFinish: () => void;
  onSkip: () => void;
  /** Called whenever the active step changes — provider uses this to navigate. */
  onStepChange?: (step: TourStep) => void | Promise<void>;
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
  onStepChange,
}: OnboardingTourProps) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tooltipH, setTooltipH] = useState(TOOLTIP_H_EST);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  /* Notify provider so it can navigate when step changes. */
  const lastNotifiedIndex = useRef(-1);
  useEffect(() => {
    if (lastNotifiedIndex.current === index) return;
    lastNotifiedIndex.current = index;
    onStepChange?.(step);
  }, [index, step, onStepChange]);

  /* Track viewport */
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Measure target whenever step / viewport changes. Polls aggressively
     to handle late-mounting elements after route changes. */
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    setRect(null); // clear previous immediately to avoid wrong-spotlight flash

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target!) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
          // Element exists but not laid out yet — keep polling
          if (attempts < 40) {
            attempts++;
            setTimeout(measure, 100);
          } else {
            setRect(null);
          }
          return;
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      } else if (attempts < 40) {
        // Up to ~4 s of polling for route-change mounts
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
    const h = tooltipH || TOOLTIP_H_EST;
    if (isMobile) {
      return {
        top: window.innerHeight - h - VIEWPORT_MARGIN,
        left: VIEWPORT_MARGIN,
        centered: false,
      };
    }

    const placement = step.placement ?? "bottom";
    let top = 0;
    let left = 0;

    switch (placement) {
      case "right":
        top = rect.top + rect.height / 2 - h / 2;
        left = rect.left + rect.width + PADDING + 4;
        break;
      case "left":
        top = rect.top + rect.height / 2 - h / 2;
        left = rect.left - TOOLTIP_W - PADDING - 4;
        break;
      case "top":
        top = rect.top - h - PADDING - 4;
        left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
        break;
      case "bottom":
      default:
        top = rect.top + rect.height + PADDING + 4;
        left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    }

    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_W - VIEWPORT_MARGIN));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - h - VIEWPORT_MARGIN));

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

  /* Full-screen dim if no target (centered card or mid-navigation) */
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
        <button
          onClick={onSkip}
          aria-label="Skip tour"
          className="absolute top-3 right-3 text-text-dimmed hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>

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
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
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
