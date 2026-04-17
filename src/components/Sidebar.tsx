import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import LoreSearchModal from "@/components/LoreSearchModal";

const WRITE_KEYS = ["manuscript", "timeline", "pov"] as const;
const WRITE_LABELS: Record<string, string> = {
  manuscript: "Manuscript",
  timeline: "Timeline",
  pov: "POV Tracker",
};
const WRITE_PATHS: Record<string, string> = {
  manuscript: "/manuscript",
  timeline: "/timeline",
  pov: "/pov-tracker",
};

const WORLD_KEYS = [
  "characters", "places", "events", "history",
  "artifacts", "creatures", "magic", "factions", "doctrine",
] as const;
const WORLD_LABELS: Record<string, string> = {
  characters: "Characters",
  places: "Places",
  events: "Events",
  history: "History",
  artifacts: "Artifacts",
  creatures: "Creatures",
  magic: "Magic",
  factions: "Factions",
  doctrine: "Doctrine",
};
const WORLD_PATHS: Record<string, string> = {
  characters: "/world/characters",
  places: "/world/places",
  events: "/world/events",
  history: "/world/history",
  artifacts: "/world/artifacts",
  creatures: "/world/creatures",
  magic: "/world/magic",
  factions: "/world/factions",
  doctrine: "/world/doctrine",
};

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const { icons, theme } = useTheme();

  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [fullSyncNote, setFullSyncNote] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const fetchPendingCount = useCallback(async () => {
    if (!activeProject) {
      setPendingCount(0);
      return;
    }
    const { count } = await supabase
      .from("lore_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", activeProject.id)
      .eq("status", "pending");
    setPendingCount(count ?? 0);
  }, [activeProject]);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSync = async (force = false) => {
    if (!activeProject || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    if (force) setFullSyncNote(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lore", {
        body: { project_id: activeProject.id, trigger: "manual", force },
      });
      if (error) throw error;

      const results: { scenes_processed?: number; suggestions_created?: number }[] =
        data?.results ?? [];
      const scenesProcessed = results.reduce((s, r) => s + (r.scenes_processed ?? 0), 0);
      const created = results.reduce((s, r) => s + (r.suggestions_created ?? 0), 0);

      if (scenesProcessed === 0) {
        setSyncMessage("No edited scenes");
      } else if (created > 0) {
        setSyncMessage(`${created} new suggestion${created !== 1 ? "s" : ""}`);
      } else {
        setSyncMessage(`${scenesProcessed} scene${scenesProcessed !== 1 ? "s" : ""} processed, 0 suggestions`);
      }
      await fetchPendingCount();
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
      setFullSyncNote(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const isActive = (path: string) => {
    if (path.startsWith("/world/")) return location.pathname.startsWith(path);
    if (location.pathname === path) return true;
    const segment = path.replace(/^\//, "");
    return location.pathname.endsWith(`/${segment}`);
  };

  const NavItem = ({ label, path, icon: Icon }: { label: string; path: string; icon: PhosphorIcon }) => {
    const active = isActive(path);
    return (
      <button
        onClick={() => navigate(path)}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-sm transition-colors relative ${
          active
            ? "text-gold-bright bg-gold-glow border border-gold"
            : "text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover border border-transparent"
        }`}
        style={
          active && theme === "outrun"
            ? { borderColor: "hsl(var(--neon-yellow))", color: "hsl(var(--neon-yellow))" }
            : undefined
        }
      >
        <Icon size={14} weight="duotone" />
        {label}
      </button>
    );
  };

  const SyncIcon = icons.sync;
  const InboxIcon = icons.inbox;

  return (
    <>
    <div className="fixed left-0 top-12 bottom-0 w-[190px] bg-fyrescribe-base border-r border-border flex flex-col z-40">
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        <div>
          <div className="px-3 mb-2 text-[10px] font-medium uppercase tracking-widest text-text-dimmed">
            Write
          </div>
          <div className="space-y-0.5">
            {WRITE_KEYS.map((key) => (
              <NavItem
                key={key}
                label={WRITE_LABELS[key]}
                path={WRITE_PATHS[key]}
                icon={icons[key]}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="px-3 mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed">
              World & Lore
            </span>
            <button
              onClick={() => setSearchOpen(true)}
              title="Search lore (⌘K)"
              className="p-0.5 rounded text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
            >
              <Search size={12} />
            </button>
          </div>
          <div className="space-y-0.5">
            {WORLD_KEYS.map((key) => (
              <NavItem
                key={key}
                label={WORLD_LABELS[key]}
                path={WORLD_PATHS[key]}
                icon={icons[key]}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-border space-y-1">
        {/* Full sync patience note */}
        {fullSyncNote && (
          <p className="px-3 py-1.5 text-[10px] text-gold/80 bg-gold/5 border border-gold/10 rounded-md">
            Full syncs can take some time, please be patient.
          </p>
        )}

        {/* Sync Lore + Full Sync */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleSync(false)}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover"
          >
            <SyncIcon size={12} weight="duotone" className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Lore"}
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            title="Full sync — ignores is_dirty, processes all scenes"
            className="px-2 py-1.5 text-[10px] rounded-md transition-colors text-text-dimmed hover:text-gold hover:bg-fyrescribe-hover disabled:opacity-40"
          >
            Full sync
          </button>
        </div>
        {syncMessage && (
          <p className="px-3 text-[10px] text-text-dimmed">{syncMessage}</p>
        )}

        {/* Lore Inbox */}
        <button
          onClick={() => navigate("/lore-inbox")}
          className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-md transition-colors ${
            location.pathname === "/lore-inbox"
              ? "text-gold-bright bg-gold-glow"
              : "text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover"
          }`}
        >
          <div className="flex items-center gap-2">
            <InboxIcon size={14} weight="duotone" />
            Lore Inbox
          </div>
          {pendingCount > 0 && (
            <span className="bg-gold text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

    </div>

    <LoreSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};

export default Sidebar;
