import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { IconSetName, ICON_SETS, THEME_DEFAULT_ICON_SET, type IconSet } from "@/lib/iconSets";

export type ThemeName = "midnight" | "fireside" | "outrun" | "lavender" | "daylight" | "enchanted";
export const isDaylightTheme = (t: ThemeName) => t === "daylight";

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  sparkle: boolean;
  setSparkle: (v: boolean) => void;
  iconSetName: IconSetName;
  setIconSet: (v: IconSetName) => void;
  icons: IconSet;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "midnight",
  setTheme: () => {},
  sparkle: false,
  setSparkle: () => {},
  iconSetName: "fantasy",
  setIconSet: () => {},
  icons: ICON_SETS.fantasy,
});

export const useTheme = () => useContext(ThemeContext);

// All variable keys that applyTheme manages — used to clear previous theme before setting new one.
const ALL_THEME_VAR_KEYS = new Set<string>();

const THEME_VARS: Record<ThemeName, Record<string, string>> = {
  midnight: {
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Cinzel', serif",
    "--font-prose": "'EB Garamond', serif",
    "--background": "228 30% 5%",
    "--foreground": "225 30% 90%",
    "--card": "228 25% 9%",
    "--card-foreground": "225 30% 90%",
    "--popover": "228 25% 9%",
    "--popover-foreground": "225 30% 90%",
    "--primary": "44 52% 54%",
    "--primary-foreground": "228 30% 5%",
    "--secondary": "228 20% 12%",
    "--secondary-foreground": "225 30% 90%",
    "--muted": "228 18% 15%",
    "--muted-foreground": "225 15% 55%",
    "--accent": "44 52% 54%",
    "--accent-foreground": "228 30% 5%",
    "--destructive": "0 62% 50%",
    "--destructive-foreground": "225 30% 90%",
    "--border": "220 25% 74% / 0.08",
    "--input": "220 25% 74% / 0.12",
    "--ring": "44 52% 54%",
    "--bg-deepest": "228 30% 4%",
    "--bg-base": "228 25% 5.5%",
    "--bg-raised": "228 22% 10%",
    "--bg-hover": "228 18% 16%",
    "--text-primary": "225 30% 90%",
    "--text-secondary": "225 15% 55%",
    "--text-dimmed": "228 22% 40%",
    "--gold": "44 52% 54%",
    "--gold-bright": "44 55% 63%",
    "--gold-glow": "44 52% 54% / 0.08",
    "--border-subtle": "220 25% 74% / 0.08",
    "--sidebar-background": "228 25% 5.5%",
    "--sidebar-foreground": "225 15% 55%",
    "--sidebar-primary": "44 52% 54%",
    "--sidebar-primary-foreground": "228 30% 5%",
    "--sidebar-accent": "44 52% 54% / 0.08",
    "--sidebar-accent-foreground": "44 55% 63%",
    "--sidebar-border": "220 25% 74% / 0.08",
    "--sidebar-ring": "44 52% 54%",
  },
  fireside: {
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Cinzel', serif",
    "--font-prose": "'EB Garamond', serif",
    "--background": "30 30% 4%",
    "--foreground": "35 40% 88%",
    "--card": "30 30% 7%",
    "--card-foreground": "35 40% 88%",
    "--popover": "30 30% 7%",
    "--popover-foreground": "35 40% 88%",
    "--primary": "24 75% 52%",
    "--primary-foreground": "30 30% 4%",
    "--secondary": "30 25% 10%",
    "--secondary-foreground": "35 40% 88%",
    "--muted": "30 20% 13%",
    "--muted-foreground": "30 15% 50%",
    "--accent": "24 75% 52%",
    "--accent-foreground": "30 30% 4%",
    "--destructive": "0 62% 50%",
    "--destructive-foreground": "35 40% 88%",
    "--border": "30 20% 70% / 0.08",
    "--input": "30 20% 70% / 0.12",
    "--ring": "24 75% 52%",
    "--bg-deepest": "30 30% 3%",
    "--bg-base": "30 30% 4%",
    "--bg-raised": "30 25% 8%",
    "--bg-hover": "30 20% 14%",
    "--text-primary": "35 40% 88%",
    "--text-secondary": "30 15% 50%",
    "--text-dimmed": "30 20% 38%",
    "--gold": "24 75% 52%",
    "--gold-bright": "24 80% 60%",
    "--gold-glow": "24 75% 52% / 0.08",
    "--border-subtle": "30 20% 70% / 0.08",
    "--sidebar-background": "30 30% 4%",
    "--sidebar-foreground": "30 15% 50%",
    "--sidebar-primary": "24 75% 52%",
    "--sidebar-primary-foreground": "30 30% 4%",
    "--sidebar-accent": "24 75% 52% / 0.08",
    "--sidebar-accent-foreground": "24 80% 60%",
    "--sidebar-border": "30 20% 70% / 0.08",
    "--sidebar-ring": "24 75% 52%",
  },
  outrun: {
    "--font-body": "'Silkscreen', monospace",
    "--font-display": "'Silkscreen', monospace",
    "--font-prose": "'Fira Code', monospace",
    "--background": "0 0% 0%",
    "--foreground": "135 100% 50%",
    "--card": "0 0% 4%",
    "--card-foreground": "135 100% 50%",
    "--popover": "0 0% 4%",
    "--popover-foreground": "135 100% 50%",
    "--primary": "135 100% 50%",
    "--primary-foreground": "0 0% 0%",
    "--secondary": "0 0% 6%",
    "--secondary-foreground": "135 100% 50%",
    "--muted": "0 0% 10%",
    "--muted-foreground": "147 100% 33%",
    "--accent": "135 100% 50%",
    "--accent-foreground": "0 0% 0%",
    "--destructive": "0 62% 50%",
    "--destructive-foreground": "135 100% 50%",
    "--border": "168 100% 50% / 0.12",
    "--input": "168 100% 50% / 0.15",
    "--ring": "168 100% 50%",
    "--bg-deepest": "0 0% 0%",
    "--bg-base": "0 0% 2%",
    "--bg-raised": "0 0% 5%",
    "--bg-hover": "0 0% 10%",
    "--text-primary": "135 100% 50%",
    "--text-secondary": "147 100% 33%",
    "--text-dimmed": "147 100% 30%",
    "--gold": "135 100% 50%",
    "--gold-bright": "135 100% 60%",
    "--gold-glow": "135 100% 50% / 0.08",
    "--neon-yellow": "72 100% 50%",
    "--border-subtle": "168 100% 50% / 0.08",
    "--sidebar-background": "0 0% 2%",
    "--sidebar-foreground": "147 100% 33%",
    "--sidebar-primary": "135 100% 50%",
    "--sidebar-primary-foreground": "0 0% 0%",
    "--sidebar-accent": "135 100% 50% / 0.08",
    "--sidebar-accent-foreground": "135 100% 60%",
    "--sidebar-border": "168 100% 50% / 0.08",
    "--sidebar-ring": "168 100% 50%",
  },
  lavender: {
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Cinzel', serif",
    "--font-prose": "'EB Garamond', serif",
    "--background": "270 30% 6%",
    "--foreground": "270 20% 90%",
    "--card": "270 28% 9%",
    "--card-foreground": "270 20% 90%",
    "--popover": "270 28% 9%",
    "--popover-foreground": "270 20% 90%",
    "--primary": "260 45% 66%",
    "--primary-foreground": "270 30% 6%",
    "--secondary": "270 22% 11%",
    "--secondary-foreground": "270 20% 90%",
    "--muted": "270 18% 14%",
    "--muted-foreground": "270 12% 50%",
    "--accent": "260 45% 66%",
    "--accent-foreground": "270 30% 6%",
    "--destructive": "0 62% 50%",
    "--destructive-foreground": "270 20% 90%",
    "--border": "270 20% 70% / 0.08",
    "--input": "270 20% 70% / 0.12",
    "--ring": "260 45% 66%",
    "--bg-deepest": "270 30% 5%",
    "--bg-base": "270 28% 6%",
    "--bg-raised": "270 22% 10%",
    "--bg-hover": "270 18% 15%",
    "--text-primary": "270 20% 90%",
    "--text-secondary": "270 12% 50%",
    "--text-dimmed": "270 18% 38%",
    "--gold": "260 45% 66%",
    "--gold-bright": "260 50% 74%",
    "--gold-glow": "260 45% 66% / 0.08",
    "--border-subtle": "270 20% 70% / 0.08",
    "--sidebar-background": "270 28% 6%",
    "--sidebar-foreground": "270 12% 50%",
    "--sidebar-primary": "260 45% 66%",
    "--sidebar-primary-foreground": "270 30% 6%",
    "--sidebar-accent": "260 45% 66% / 0.08",
    "--sidebar-accent-foreground": "260 50% 74%",
    "--sidebar-border": "270 20% 70% / 0.08",
    "--sidebar-ring": "260 45% 66%",
  },
  daylight: {
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Cinzel', serif",
    "--font-prose": "'EB Garamond', serif",
    "--background": "40 25% 96%",
    "--foreground": "0 0% 10%",
    "--card": "0 0% 100%",
    "--card-foreground": "0 0% 10%",
    "--popover": "0 0% 100%",
    "--popover-foreground": "0 0% 10%",
    "--primary": "30 55% 34%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "40 15% 90%",
    "--secondary-foreground": "0 0% 10%",
    "--muted": "40 10% 88%",
    "--muted-foreground": "0 0% 35%",
    "--accent": "30 55% 34%",
    "--accent-foreground": "0 0% 100%",
    "--destructive": "0 62% 50%",
    "--destructive-foreground": "0 0% 100%",
    "--border": "0 0% 20% / 0.10",
    "--input": "0 0% 20% / 0.12",
    "--ring": "30 55% 34%",
    "--bg-deepest": "40 20% 94%",
    "--bg-base": "40 25% 96%",
    "--bg-raised": "0 0% 100%",
    "--bg-hover": "40 15% 90%",
    "--text-primary": "0 0% 10%",
    "--text-secondary": "0 0% 35%",
    "--text-dimmed": "0 0% 65%",
    "--gold": "30 55% 34%",
    "--gold-bright": "30 60% 42%",
    "--gold-glow": "30 55% 34% / 0.08",
    "--border-subtle": "0 0% 20% / 0.06",
    "--sidebar-background": "40 25% 96%",
    "--sidebar-foreground": "0 0% 35%",
    "--sidebar-primary": "30 55% 34%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-accent": "30 55% 34% / 0.08",
    "--sidebar-accent-foreground": "30 60% 42%",
    "--sidebar-border": "0 0% 20% / 0.06",
    "--sidebar-ring": "30 55% 34%",
  },
  enchanted: {
    "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    "--font-display": "'Cinzel', serif",
    "--font-prose": "'EB Garamond', serif",
    "--background": "140 25% 4%",
    "--foreground": "170 30% 88%",
    "--card": "140 22% 7%",
    "--card-foreground": "170 30% 88%",
    "--popover": "140 22% 7%",
    "--popover-foreground": "170 30% 88%",
    "--primary": "160 100% 39%",
    "--primary-foreground": "140 25% 4%",
    "--secondary": "140 20% 9%",
    "--secondary-foreground": "170 30% 88%",
    "--muted": "140 18% 12%",
    "--muted-foreground": "160 12% 45%",
    "--accent": "160 100% 39%",
    "--accent-foreground": "140 25% 4%",
    "--destructive": "0 62% 50%",
    "--destructive-foreground": "170 30% 88%",
    "--border": "150 20% 65% / 0.08",
    "--input": "150 20% 65% / 0.12",
    "--ring": "160 100% 39%",
    "--bg-deepest": "140 25% 3%",
    "--bg-base": "140 22% 4%",
    "--bg-raised": "140 20% 8%",
    "--bg-hover": "140 18% 13%",
    "--text-primary": "170 30% 88%",
    "--text-secondary": "180 12% 45%",
    "--text-dimmed": "180 18% 36%",
    "--gold": "160 100% 39%",
    "--gold-bright": "160 100% 48%",
    "--gold-glow": "160 100% 39% / 0.08",
    "--border-subtle": "150 20% 65% / 0.08",
    "--sidebar-background": "140 22% 4%",
    "--sidebar-foreground": "160 12% 45%",
    "--sidebar-primary": "160 100% 39%",
    "--sidebar-primary-foreground": "140 25% 4%",
    "--sidebar-accent": "160 100% 39% / 0.08",
    "--sidebar-accent-foreground": "160 100% 48%",
    "--sidebar-border": "150 20% 65% / 0.08",
    "--sidebar-ring": "160 100% 39%",
  },
};

// Populate ALL_THEME_VAR_KEYS once at module load so applyTheme can do a full clear.
for (const vars of Object.values(THEME_VARS)) {
  for (const key of Object.keys(vars)) {
    ALL_THEME_VAR_KEYS.add(key);
  }
}

function applyTheme(theme: ThemeName) {
  const vars = THEME_VARS[theme];
  const root = document.documentElement;
  for (const key of ALL_THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeName>("midnight");
  const [sparkle, setSparkleState] = useState(false);
  const [iconSetName, setIconSetState] = useState<IconSetName>("fantasy");
  const [loaded, setLoaded] = useState(false);

  // Load preferences from DB
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_preferences")
      .select("theme, sparkle_enabled, icon_set")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setThemeState(data.theme as ThemeName);
          setSparkleState(data.sparkle_enabled);
          if (data.icon_set) {
            setIconSetState(data.icon_set as IconSetName);
          } else {
            setIconSetState(THEME_DEFAULT_ICON_SET[data.theme] || "fantasy");
          }
          applyTheme(data.theme as ThemeName);
        }
        setLoaded(true);
      });
  }, [user]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const persistPrefs = async (t: ThemeName, s: boolean, i: IconSetName) => {
    if (!user) return;
    await supabase.from("user_preferences").upsert(
      { user_id: user.id, theme: t, sparkle_enabled: s, icon_set: i, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  };

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    persistPrefs(t, sparkle, iconSetName);
  };

  const setSparkle = (v: boolean) => {
    setSparkleState(v);
    persistPrefs(theme, v, iconSetName);
  };

  const setIconSet = (v: IconSetName) => {
    setIconSetState(v);
    persistPrefs(theme, sparkle, v);
  };

  // Outrun theme always uses the sci-fi icon set regardless of saved preference
  const icons = ICON_SETS[theme === "outrun" ? "scifi" : iconSetName];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, sparkle, setSparkle, iconSetName, setIconSet, icons }}>
      {children}
    </ThemeContext.Provider>
  );
};
