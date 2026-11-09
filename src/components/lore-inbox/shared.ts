// Shared helpers for the Lore Inbox tabs.

export const CATEGORY_COLORS: Record<string, string> = {
  characters: "bg-blue-500/20 text-blue-300",
  places: "bg-green-500/20 text-green-300",
  events: "bg-orange-500/20 text-orange-300",
  history: "bg-amber-500/20 text-amber-300",
  artifacts: "bg-purple-500/20 text-purple-300",
  creatures: "bg-red-500/20 text-red-300",
  magic: "bg-cyan-500/20 text-cyan-300",
  factions: "bg-yellow-500/20 text-yellow-300",
  doctrine: "bg-pink-500/20 text-pink-300",
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Fired whenever inbox contents change (an item is reviewed, or a sync adds
 * new suggestions). The sidebar badge and the inbox page both listen for it.
 */
export const LORE_INBOX_CHANGED = "fyrescribe:lore-inbox-changed";

/** `reload: true` (used after a sync) also tells open tabs to re-fetch their lists. */
export const notifyLoreInboxChanged = (opts: { reload?: boolean } = {}) => {
  window.dispatchEvent(new CustomEvent(LORE_INBOX_CHANGED, { detail: { reload: !!opts.reload } }));
};

export type InboxTab = "entries" | "connections" | "mentions" | "tags";

export const INBOX_TABS: { id: InboxTab; label: string }[] = [
  { id: "entries", label: "Entries" },
  { id: "connections", label: "Connections" },
  { id: "mentions", label: "Mentions" },
  { id: "tags", label: "Tags" },
];
