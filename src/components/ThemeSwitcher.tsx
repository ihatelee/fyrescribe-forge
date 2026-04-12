import { Paintbrush } from "lucide-react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES: { value: ThemeName; label: string; swatch: string; suffix?: string }[] = [
  { value: "midnight", label: "Midnight", swatch: "#C9A84C" },
  { value: "fireside", label: "Fireside", swatch: "#E07B2A" },
  { value: "lavender", label: "Lavender Haze", swatch: "#9B7FD4" },
  { value: "enchanted", label: "Enchanted", swatch: "#00C896" },
  { value: "futureworld", label: "Futureworld", swatch: "#00FFE0" },
  { value: "daylight", label: "Daylight", swatch: "#8B5E2A", suffix: "light mode" },
];

const ThemeSwitcher = () => {
  const { theme, setTheme, sparkle, setSparkle } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-7 h-7 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-secondary hover:text-foreground transition-colors">
          <Paintbrush size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border w-48">
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className="cursor-pointer flex items-center gap-2"
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0 border border-border"
              style={{ backgroundColor: t.swatch }}
            />
            <span className="flex-1">
              {t.label}
              {t.suffix && <em className="text-muted-foreground ml-1 text-xs">{t.suffix}</em>}
            </span>
            {theme === t.value && <span className="text-gold text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="cursor-pointer flex items-center gap-2"
        >
          <span className="flex-1 text-sm">Make it Sparkle</span>
          <Switch
            checked={sparkle}
            onCheckedChange={setSparkle}
            className="scale-75"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeSwitcher;
