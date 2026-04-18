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

export interface SceneSearchResult {
  type: "scene";
  id: string;
  title: string;
  chapterTitle: string;
  content: string;
}

export function useLoreSearch(projectId: string | undefined, query: string) {
  const [results, setResults] = useState<LoreSearchResult[]>([]);
  const [sceneResults, setSceneResults] = useState<SceneSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!projectId || q.length < 2) {
      setResults([]);
      setSceneResults([]);
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

      // Note: JSONB columns (fields, sections) can't be ilike-filtered via PostgREST
      // without a SQL function. Name + summary + aliases cover most cases; scene
      // content search handles the rest.
      const [nameRes, aliasRes, sceneRes] = await Promise.all([
        base().or(`name.ilike.%${q}%,summary.ilike.%${q}%`),
        base().contains("aliases", [q]),
        supabase
          .from("scenes")
          .select("id, title, content, chapters(title)")
          .eq("project_id", projectId)
          .ilike("content", `%${q}%`)
          .limit(10),
      ]);

      if (cancelled) return;

      const err = nameRes.error ?? sceneRes.error;
      // aliasRes uses exact array containment; ignore its errors silently
      if (err) {
        setError(err.message);
        setIsLoading(false);
        return;
      }

      const seen = new Set<string>();
      const merged: LoreSearchResult[] = [];
      for (const row of [
        ...(nameRes.data ?? []),
        ...(aliasRes.data ?? []),
      ]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row as LoreSearchResult);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedScenes: SceneSearchResult[] = (sceneRes.data ?? []).map((s: any) => ({
        type: "scene" as const,
        id: s.id,
        title: s.title,
        chapterTitle: s.chapters?.title ?? "",
        content: s.content ?? "",
      }));

      setResults(merged);
      setSceneResults(mappedScenes);
      setIsLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, query]);

  return { results, sceneResults, isLoading, error };
}
