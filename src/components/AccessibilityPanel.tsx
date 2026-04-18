import { SlidersHorizontal, PlayCircle } from "lucide-react";
import { useTheme, type InterfaceScale } from "@/contexts/ThemeContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const SCALES: InterfaceScale[] = [75, 100, 125, 150];

const AccessibilityPanel = () => {
  const {
    interfaceScale,
    setInterfaceScale,
    highContrast,
    setHighContrast,
    dyslexiaFont,
    setDyslexiaFont,
  } = useTheme();
  const { startTour } = useOnboarding();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Accessibility"
          className="w-7 h-7 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-secondary hover:text-foreground transition-colors"
        >
          <SlidersHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border w-56">
        {/* Interface scale */}
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-text-dimmed font-medium">
          Interface Scale
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="focus:bg-transparent cursor-default flex items-center gap-1 py-1.5"
        >
          {SCALES.map((s) => (
            <button
              key={s}
              onClick={() => setInterfaceScale(s)}
              className={cn(
                "flex-1 text-xs px-1.5 py-1 rounded-md border transition-colors",
                interfaceScale === s
                  ? "bg-gold/10 border-gold/50 text-gold"
                  : "bg-fyrescribe-raised border-border text-text-secondary hover:text-foreground"
              )}
            >
              {s}%
            </button>
          ))}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* High contrast */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="cursor-pointer flex items-center gap-2"
        >
          <span className="flex-1 text-sm">High Contrast</span>
          <Switch
            checked={highContrast}
            onCheckedChange={setHighContrast}
            className="scale-75"
          />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Dyslexia-friendly font */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="cursor-pointer flex items-center gap-2"
        >
          <span className="flex-1 text-sm">Sans-Serif Font</span>
          <Switch
            checked={dyslexiaFont}
            onCheckedChange={setDyslexiaFont}
            className="scale-75"
          />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Replay onboarding tutorial */}
        <DropdownMenuItem
          onSelect={() => startTour()}
          className="cursor-pointer flex items-center gap-2"
        >
          <PlayCircle size={14} className="text-gold" />
          <span className="flex-1 text-sm">Show Tutorial</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AccessibilityPanel;
