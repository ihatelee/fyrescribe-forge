import { Paintbrush, Check, SparkleIcon } from "lucide-react";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { ICON_SET_META, ICON_SETS, type IconSetName } from "@/lib/iconSets";
import { Sparkle as SparklePhosphor } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const THEMES: { value: ThemeName; label: string; swatch: string; suffix?: string }[] = [
  { value: "midnight", label: "Midnight", swatch: "#C9A84C" },
  { value: "fireside", label: "Fireside", swatch: "#E07B2A" },
  { value: "lavender", label: "Lavender Haze", swatch: "#9B7FD4" },
  { value: "enchanted", label: "Enchanted", swatch: "#00C896" },
  { value: "outrun", label: "Outrun", swatch: "#00FF41" },
  { value: "daylight", label: "Daylight", swatch: "#8B5E2A", suffix: "light mode" },
];

const ThemeSwitcher = () => {
  const { theme, setTheme, sparkle, setSparkle, whimsical, setWhimsical, iconSetName, setIconSet } = useTheme();
  // When outrun is active the icon set is forced to scifi regardless of saved preference
  const effectiveIconSet = theme === "outrun" ? "scifi" : iconSetName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-7 h-7 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-secondary hover:text-foreground transition-colors">
          <Paintbrush size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border w-56">
        {/* Color themes */}
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
            {theme === t.value && <Check size={12} className="text-gold" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Icon set selector */}
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-text-dimmed font-medium">
          Icon Set
        </DropdownMenuLabel>
        {ICON_SET_META.map((set) => {
          const icons = ICON_SETS[set.value];
          // Show a few representative icons as preview
          const PreviewIcon1 = icons.characters;
          const PreviewIcon2 = icons.magic;
          const PreviewIcon3 = icons.creatures;
          return (
            <DropdownMenuItem
              key={set.value}
              onClick={() => setIconSet(set.value)}
              className="cursor-pointer flex items-center gap-2"
            >
              <span className="flex items-center gap-0.5 flex-shrink-0 text-text-secondary">
                <PreviewIcon1 size={12} weight="duotone" />
                <PreviewIcon2 size={12} weight="duotone" />
                <PreviewIcon3 size={12} weight="duotone" />
              </span>
              <span className="flex-1 text-sm">{set.label}</span>
              {effectiveIconSet === set.value && <Check size={12} className="text-gold" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        {/* Sparkle toggle */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="cursor-pointer flex items-center gap-2"
        >
          <SparklePhosphor size={14} weight="duotone" className="text-gold flex-shrink-0" />
          <span className="flex-1 text-sm">{theme === "outrun" ? "Time to Run" : "Make it Sparkle"}</span>
          <Switch
            checked={sparkle}
            onCheckedChange={setSparkle}
            className="scale-75"
          />
        </DropdownMenuItem>

        {/* Whimsical toggle — desktop only */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="hidden md:flex cursor-pointer items-center gap-2"
        >
          <span className="text-gold flex-shrink-0 text-sm leading-none">✦</span>
          <span className="flex-1 text-sm">Make it Whimsical</span>
          <Switch
            checked={whimsical}
            onCheckedChange={setWhimsical}
            className="scale-75"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeSwitcher;
