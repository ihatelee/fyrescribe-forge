import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type EntityCategory = Database["public"]["Enums"]["entity_category"];

export interface LoreSearchResult {
  id: string;
  name: string;
  category: EntityCategory;
  summary: string | null;
}

export function useLoreSearch(projectId: string | undefined, query: string) {
  const [results, setResults] = useState<LoreSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!projectId || q.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    let cancelled = false;

    const timer = setTimeout(async () => {
      const base = () =>
        supabase
          .from("entities")
          .select("id, name, category, summary")
          .eq("project_id", projectId)
          .is("archived_at", null)
          .limit(20);

      const [nameRes, fieldsRes, sectionsRes] = await Promise.all([
        base().or(`name.ilike.%${q}%,summary.ilike.%${q}%`),
        base().filter("fields::text", "ilike", `%${q}%`),
        base().filter("sections::text", "ilike", `%${q}%`),
      ]);

      if (cancelled) return;

      const err = nameRes.error ?? fieldsRes.error ?? sectionsRes.error;
      if (err) {
        setError(err.message);
        setIsLoading(false);
        return;
      }

      const seen = new Set<string>();
      const merged: LoreSearchResult[] = [];
      for (const row of [
        ...(nameRes.data ?? []),
        ...(fieldsRes.data ?? []),
        ...(sectionsRes.data ?? []),
      ]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row as LoreSearchResult);
        }
      }

      setResults(merged);
      setIsLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, query]);

  return { results, isLoading, error };
}
