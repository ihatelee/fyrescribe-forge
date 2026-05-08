import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import LoreSearchModal from "@/components/LoreSearchModal";
import LinkLoreModal from "@/components/LinkLoreModal";
import SyncMentionsModal, { type NewMention } from "@/components/SyncMentionsModal";
import SyncTagsModal, { type TagSuggestion } from "@/components/SyncTagsModal";

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
  const [fullSyncing, setFullSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [fullSyncMessage, setFullSyncMessage] = useState<string | null>(null);
  const [fullSyncNote, setFullSyncNote] = useState(false);
  const [syncingMentions, setSyncingMentions] = useState(false);
  const [mentionsMessage, setMentionsMessage] = useState<string | null>(null);
  const [linkingLore, setLinkingLore] = useState(false);
  const [linkLoreMessage, setLinkLoreMessage] = useState<string | null>(null);
  const [syncingTags, setSyncingTags] = useState(false);
  const [tagsMessage, setTagsMessage] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [linkLoreModalOpen, setLinkLoreModalOpen] = useState(false);
  const [mentionsModalOpen, setMentionsModalOpen] = useState(false);
  const [newMentions, setNewMentions] = useState<NewMention[]>([]);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);

  const fetchPendingCount = useCallback(async () => {
    if (!activeProject) {
      setPendingCount(0);
      return;
    }
    const projectId = activeProject.id;
    const [loreRes, linksRes, mentionsRes, tagsRes] = await Promise.all([
      supabase
        .from("lore_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "pending"),
      supabase
        .from("lore_link_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "pending"),
      supabase
        .from("mention_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "pending"),
      supabase
        .from("tag_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "pending"),
    ]);
    const total =
      (loreRes.count ?? 0) +
      (linksRes.count ?? 0) +
      (mentionsRes.count ?? 0) +
      (tagsRes.count ?? 0);
    setPendingCount(total);
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
    if (!activeProject) return;
    if (force ? fullSyncing : syncing) return;
    const setBusy = force ? setFullSyncing : setSyncing;
    const setMsg = force ? setFullSyncMessage : setSyncMessage;
    setBusy(true);
    setMsg(null);
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
        setMsg("No edited scenes");
      } else if (created > 0) {
        setMsg(`${created} new suggestion${created !== 1 ? "s" : ""}`);
      } else {
        setMsg(`${scenesProcessed} scene${scenesProcessed !== 1 ? "s" : ""} processed, 0 suggestions`);
      }
      await fetchPendingCount();

      // Full sync also runs mentions, link-lore, then sync-tags
      if (force) {
        await handleSyncMentionsInner();
        await handleLinkLoreInner();
        await handleSyncTagsInner();
        await fetchPendingCount();
      }
    } catch {
      setMsg(force ? "Full Sync failed" : "Sync failed");
    } finally {
      setBusy(false);
      setFullSyncNote(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleSyncMentionsInner = async () => {
    if (!activeProject) return { found: undefined, fresh: [] as NewMention[] };
    const { data, error } = await supabase.functions.invoke("sync-mentions", {
      body: { project_id: activeProject.id },
    });
    if (error) throw error;
    return {
      found: data?.mentions_found as number | undefined,
      fresh: (data?.new_mentions as NewMention[]) ?? [],
    };
  };

  const handleSyncMentions = async () => {
    if (!activeProject || syncingMentions) return;
    setSyncingMentions(true);
    setMentionsMessage(null);
    try {
      const { found, fresh } = await handleSyncMentionsInner();
      setMentionsMessage(
        found != null ? `Found ${found} mention${found !== 1 ? "s" : ""}` : "Done",
      );
      setNewMentions(fresh);
      setMentionsModalOpen(true);
      await fetchPendingCount();
    } catch {
      setMentionsMessage("Sync failed");
    } finally {
      setSyncingMentions(false);
      setTimeout(() => setMentionsMessage(null), 4000);
    }
  };

  const handleLinkLoreInner = async () => {
    if (!activeProject) return;
    const { data, error } = await supabase.functions.invoke("link-lore", {
      body: { project_id: activeProject.id },
    });
    if (error) throw error;
    return data?.suggestions_created as number | undefined;
  };

  const handleSyncTagsInner = async (): Promise<TagSuggestion[]> => {
    if (!activeProject) return [];
    const { data, error } = await supabase.functions.invoke("sync-tags", {
      body: { project_id: activeProject.id },
    });
    if (error) throw error;
    return (data?.suggestions as TagSuggestion[]) ?? [];
  };

  const handleSyncTags = async () => {
    if (!activeProject || syncingTags) return;
    setSyncingTags(true);
    setTagsMessage(null);
    try {
      const suggestions = await handleSyncTagsInner();
      setTagsMessage(
        `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""}`,
      );
      setTagSuggestions(suggestions);
      setTagsModalOpen(true);
      await fetchPendingCount();
    } catch {
      setTagsMessage("Sync failed");
    } finally {
      setSyncingTags(false);
      setTimeout(() => setTagsMessage(null), 4000);
    }
  };

  const handleLinkLore = async () => {
    if (!activeProject || linkingLore) return;
    setLinkingLore(true);
    setLinkLoreMessage(null);
    try {
      const created = await handleLinkLoreInner();
      setLinkLoreMessage(
        created != null ? `Found ${created} suggested link${created !== 1 ? "s" : ""}` : "Done",
      );
      setLinkLoreModalOpen(true);
      await fetchPendingCount();
    } catch {
      setLinkLoreMessage("Sync Connections failed");
    } finally {
      setLinkingLore(false);
      setTimeout(() => setLinkLoreMessage(null), 4000);
    }
  };

  const isActive = (path: string) => {
    if (path.startsWith("/world/")) return location.pathname.startsWith(path);
    if (location.pathname === path) return true;
    const segment = path.replace(/^\//, "");
    return location.pathname.endsWith(`/${segment}`);
  };

  const navigateAndClose = (path: string) => {
    navigate(path);
    window.dispatchEvent(new CustomEvent("mobile-nav-close"));
  };

  const NavItem = ({ label, path, icon: Icon }: { label: string; path: string; icon: PhosphorIcon }) => {
    const active = isActive(path);
    return (
      <button
        onClick={() => navigateAndClose(path)}
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
    <div className="w-[190px] h-full bg-fyrescribe-base border-r border-border flex flex-col">
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
            {/* Notes uses a lucide icon (not in themed icon sets) */}
            <button
              onClick={() => navigateAndClose("/notes")}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-sm transition-colors relative ${
                isActive("/notes")
                  ? "text-gold-bright bg-gold-glow border border-gold"
                  : "text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover border border-transparent"
              }`}
              style={
                isActive("/notes") && theme === "outrun"
                  ? { borderColor: "hsl(var(--neon-yellow))", color: "hsl(var(--neon-yellow))" }
                  : undefined
              }
            >
              <StickyNote size={14} />
              Notes
            </button>
          </div>
        </div>

        <div data-tour="world-nav">
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

      <div data-tour="ai-tools" className="p-2 border-t border-border space-y-1">
        {/* Full sync patience note */}
        {fullSyncNote && (
          <p className="px-3 py-1.5 text-[10px] text-gold/80 bg-gold/5 border border-gold/10 rounded-md">
            Full syncs can take some time, please be patient.
          </p>
        )}

        <div data-tour="sync-buttons" className="space-y-1">
        {/* Sync Lore Entries */}
        <button
          onClick={() => handleSync(false)}
          disabled={syncing}
          className="w-full flex items-center justify-start text-left gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40"
        >
          <SyncIcon size={12} weight="duotone" className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync Lore Entries"}
        </button>
        {syncMessage && (
          <p className="px-3 text-[10px] text-text-dimmed">{syncMessage}</p>
        )}

        {/* Sync Mentions */}
        <button
          onClick={handleSyncMentions}
          disabled={syncingMentions || !activeProject}
          className="w-full flex items-center justify-start text-left gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40"
        >
          <SyncIcon size={12} weight="duotone" className={syncingMentions ? "animate-spin" : ""} />
          {syncingMentions ? "Scanning…" : "Sync Mentions"}
        </button>
        {mentionsMessage && (
          <p className="px-3 text-[10px] text-text-dimmed">{mentionsMessage}</p>
        )}

        {/* Link Lore */}
        <button
          onClick={handleLinkLore}
          disabled={linkingLore || !activeProject}
          className="w-full flex items-center justify-start text-left gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40"
        >
          <SyncIcon size={12} weight="duotone" className={linkingLore ? "animate-spin" : ""} />
          {linkingLore ? "Linking…" : "Sync Connections"}
        </button>
        {linkLoreMessage && (
          <p className="px-3 text-[10px] text-text-dimmed">{linkLoreMessage}</p>
        )}

        {/* Sync Tags */}
        <button
          onClick={handleSyncTags}
          disabled={syncingTags || !activeProject}
          className="w-full flex items-center justify-start text-left gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40"
        >
          <SyncIcon size={12} weight="duotone" className={syncingTags ? "animate-spin" : ""} />
          {syncingTags ? "Tagging…" : "Sync Tags"}
        </button>
        {tagsMessage && (
          <p className="px-3 text-[10px] text-text-dimmed">{tagsMessage}</p>
        )}

        {/* Divider before Full Sync */}
        <div className="h-px bg-border my-1" />

        {/* Full Sync */}
        <button
          onClick={() => handleSync(true)}
          disabled={fullSyncing}
          title="Full Sync — ignores is_dirty, processes all scenes"
          className="w-full flex items-center justify-start text-left gap-2 px-3 py-1.5 text-[12px] rounded-md transition-colors text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40"
        >
          <SyncIcon size={12} weight="duotone" className={fullSyncing ? "animate-spin" : ""} />
          {fullSyncing ? "Full syncing…" : "Full Sync"}
        </button>
        {fullSyncMessage && (
          <p className="px-3 text-[10px] text-text-dimmed">{fullSyncMessage}</p>
        )}
        </div>

        {/* Visual divider between sync controls and Lore Inbox */}
        <div className="h-px bg-border my-2" />

        {/* Lore Inbox */}
        <button
          onClick={() => navigateAndClose("/lore-inbox")}
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
    {linkLoreModalOpen && activeProject && (
      <LinkLoreModal
        projectId={activeProject.id}
        onClose={() => {
          setLinkLoreModalOpen(false);
          fetchPendingCount();
        }}
      />
    )}
    {mentionsModalOpen && activeProject && (
      <SyncMentionsModal
        projectId={activeProject.id}
        mentions={newMentions}
        onClose={() => {
          setMentionsModalOpen(false);
          fetchPendingCount();
        }}
      />
    )}
    {tagsModalOpen && (
      <SyncTagsModal
        suggestions={tagSuggestions}
        onClose={() => {
          setTagsModalOpen(false);
          fetchPendingCount();
        }}
      />
    )}
    </>
  );
};

export default Sidebar;
