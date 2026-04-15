/**
 * The 4 suggestion types emitted by sync-lore.
 * Stored in payload.type on each lore_suggestions row.
 */
export type LoreSuggestionType = "character" | "location" | "item" | "lore";

/**
 * Shape of a lore suggestion as inserted by sync-lore.
 * scene_id is a top-level column; all other fields are in payload.
 */
export interface LoreSuggestion {
  id: string;
  scene_id: string;
  source_sentence: string;
  type: LoreSuggestionType;
  name: string;
  description: string;
  status: "pending";
  created_at: string;
}

/**
 * Maps sync-lore's 4 suggestion types to entity_category values
 * used for UI display (colour badges, etc.).
 */
export const LORE_TYPE_TO_CATEGORY: Record<LoreSuggestionType, string> = {
  character: "characters",
  location: "places",
  item: "artifacts",
  lore: "magic",
};
