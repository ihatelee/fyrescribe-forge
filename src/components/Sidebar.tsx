import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Clock,
  Users,
  MapPin,
  Calendar,
  BookMarked,
  Gem,
  Bug,
  Wand2,
  Shield,
  ScrollText,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";

const WRITE_ITEMS = [
  { label: "Manuscript", path: "/manuscript", icon: BookOpen },
  { label: "Timeline", path: "/timeline", icon: Clock },
];

const WORLD_ITEMS = [
  { label: "Characters", path: "/world/characters", icon: Users },
  { label: "Places", path: "/world/places", icon: MapPin },
  { label: "Events", path: "/world/events", icon: Calendar },
  { label: "History", path: "/world/history", icon: BookMarked },
  { label: "Artifacts", path: "/world/artifacts", icon: Gem },
  { label: "Creatures", path: "/world/creatures", icon: Bug },
  { label: "Magic", path: "/world/magic", icon: Wand2 },
  { label: "Factions", path: "/world/factions", icon: Shield },
  { label: "Doctrine", path: "/world/doctrine", icon: ScrollText },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();

  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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

  const handleSync = async () => {
    if (!activeProject || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lore", {
        body: { project_id: activeProject.id, trigger: "manual" },
      });
      if (error) throw error;
      const created: number =
        data?.results?.reduce(
          (sum: number, r: { suggestions_created?: number }) => sum + (r.suggestions_created ?? 0),
          0,
        ) ?? 0;
      setSyncMessage(
        data?.message === "No projects with dirty scenes"
          ? "Up to date"
          : created > 0
          ? `${created} new suggestion${created !== 1 ? "s" : ""}`
          : "No new suggestions",
      );
      await fetchPendingCount();
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 3500);
    }
  };

  const isActive = (path: string) => {
    if (path.startsWith("/world/")) return location.pathname.startsWith(path);
    return location.pathname === path;
  };

  const NavItem = ({ label, path, icon: Icon }: { label: string; path: string; icon: LucideIcon }) => {
    const active = isActive(path);
    return (
      <button
        onClick={() => navigate(path)}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-sm transition-colors relative ${
          active
            ? "text-gold-bright bg-gold-glow border-l-2 border-gold pl-[10px]"
            : "text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover border-l-2 border-transparent pl-[10px]"
        }`}
      >
        <Icon size={14} />
        {label}
      </button>
    );
  };

  return (
    <div className="fixed left-0 top-12 bottom-0 w-[190px] bg-fyrescribe-base border-r border-border flex flex-col z-40">
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        <div>
          <div className="px-3 mb-2 text-[10px] font-medium uppercase tracking-widest text-text-dimmed">
            Write
          </div>
          <div className="space-y-0.5">
            {WRITE_ITEMS.map((item) => (
              <NavItem key={item.path} {...item} />
            ))}
          </div>
        </div>

        <div>
          <div className="px-3 mb-2 text-[10px] font-medium uppercase tracking-widest text-text-dimmed">
            World & Lore
          </div>
          <div className="space-y-0.5">
            {WORLD_ITEMS.map((item) => (
              <NavItem key={item.path} {...item} />
            ))}
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-border space-y-1">
        {/* Sync Now */}
        <button
          onClick={handleSync}
          disabled={!activeProject || syncing}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-dimmed hover:text-text-secondary hover:bg-fyrescribe-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Now"}
          </div>
          {syncMessage && (
            <span className="text-[10px] text-text-dimmed truncate max-w-[80px]">{syncMessage}</span>
          )}
        </button>

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
            <Inbox size={14} />
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
  );
};

export default Sidebar;
