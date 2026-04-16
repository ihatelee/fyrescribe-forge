import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";

interface Chapter {
  id: string;
  title: string;
  order: number;
}

interface Scene {
  id: string;
  title: string;
  chapter_id: string;
  order: number;
  word_count: number | null;
  pov_character_id: string | null;
}

interface Character {
  id: string;
  name: string;
}

const POVTrackerPage = () => {
  const { activeProject } = useActiveProject();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    const load = async () => {
      setLoading(true);
      const [chaptersRes, scenesRes, charsRes] = await Promise.all([
        supabase
          .from("chapters")
          .select("id, title, order")
          .eq("project_id", activeProject.id)
          .order("order"),
        supabase
          .from("scenes")
          .select("id, title, chapter_id, order, word_count, pov_character_id")
          .eq("project_id", activeProject.id)
          .order("order"),
        supabase
          .from("entities")
          .select("id, name")
          .eq("project_id", activeProject.id)
          .eq("category", "characters")
          .order("name"),
      ]);
      setChapters(chaptersRes.data ?? []);
      setScenes(scenesRes.data ?? []);
      setCharacters(charsRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [activeProject]);

  const handlePovChange = async (sceneId: string, characterId: string | null) => {
    setSaving(sceneId);
    const { error } = await supabase
      .from("scenes")
      .update({ pov_character_id: characterId })
      .eq("id", sceneId);
    if (!error) {
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, pov_character_id: characterId } : s))
      );
    } else {
      console.error("Failed to update POV:", error);
    }
    setSaving(null);
  };

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="font-display text-xl text-foreground tracking-wide mb-6">
          POV Tracker
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-text-dimmed" />
          </div>
        ) : chapters.length === 0 ? (
          <p className="text-text-secondary text-sm">
            No chapters yet. Add content in the Manuscript view first.
          </p>
        ) : (
          <div className="bg-fyrescribe-raised border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed w-1/4">
                    Chapter
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed w-1/3">
                    Scene
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed">
                    POV Character
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed w-24">
                    Words
                  </th>
                </tr>
              </thead>
              <tbody>
                {chapters.flatMap((chapter) => {
                  const chapterScenes = scenes
                    .filter((s) => s.chapter_id === chapter.id)
                    .sort((a, b) => a.order - b.order);
                  return chapterScenes.map((scene, idx) => (
                    <tr
                      key={scene.id}
                      className="border-b border-border last:border-0 hover:bg-fyrescribe-hover transition-colors"
                    >
                      <td className="px-4 py-2.5 text-sm text-text-secondary">
                        {idx === 0 ? chapter.title : ""}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-foreground">
                        {scene.title}
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative">
                          <select
                            value={scene.pov_character_id ?? ""}
                            onChange={(e) =>
                              handlePovChange(scene.id, e.target.value || null)
                            }
                            disabled={saving === scene.id}
                            className="w-full bg-fyrescribe-base border border-border rounded px-2.5 py-1.5 text-sm text-foreground appearance-none cursor-pointer hover:border-gold/50 focus:border-gold focus:outline-none transition-colors disabled:opacity-50 pr-7"
                          >
                            <option value="">— None —</option>
                            {characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {saving === scene.id ? (
                            <Loader2
                              size={12}
                              className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-dimmed pointer-events-none"
                            />
                          ) : (
                            <svg
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dimmed pointer-events-none"
                              width="10"
                              height="6"
                              viewBox="0 0 10 6"
                              fill="none"
                            >
                              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-text-dimmed text-right">
                        {(scene.word_count ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default POVTrackerPage;
