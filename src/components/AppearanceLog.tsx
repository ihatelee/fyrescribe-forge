import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AppearanceLogProps {
  entityId: string;
  entityName: string;
  projectId: string;
}

interface MentionRow {
  id: string;
  context: string;
  position: number;
  scene_id: string;
  scene_title: string;
  scene_order: number;
  chapter_id: string;
  chapter_title: string;
  chapter_order: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/** Render `context` with all case-insensitive matches of `name` bolded. */
function HighlightedContext({ context, name }: { context: string; name: string }) {
  if (!name) return <>{context}</>;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = context.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <strong key={i} className="text-foreground font-semibold">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const AppearanceLog = ({ entityId, entityName, projectId }: AppearanceLogProps) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const fetchMentions = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("entity_mentions")
        .select(
          "id, context, position, scene_id, scenes!inner(title, order, chapter_id, chapters!inner(title, order))",
        )
        .eq("entity_id", entityId);

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch mentions:", error);
        setRows([]);
      } else {
        const mapped: MentionRow[] = (data ?? [])
          .map((m: any) => ({
            id: m.id,
            context: m.context ?? "",
            position: m.position ?? 0,
            scene_id: m.scene_id,
            scene_title: m.scenes?.title ?? "Untitled scene",
            scene_order: m.scenes?.order ?? 0,
            chapter_id: m.scenes?.chapter_id ?? "",
            chapter_title: m.scenes?.chapters?.title ?? "Untitled chapter",
            chapter_order: m.scenes?.chapters?.order ?? 0,
          }))
          .sort(
            (a, b) =>
              a.chapter_order - b.chapter_order ||
              a.scene_order - b.scene_order ||
              a.position - b.position,
          );
        setRows(mapped);
      }
      setLoading(false);
    };
    fetchMentions();
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize],
  );

  const handleNavigate = (sceneId: string) => {
    navigate(`/project/${projectId}/manuscript?scene=${sceneId}`);
  };

  return (
    <div className="border-t border-border pt-8 mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-base text-foreground tracking-wide">Appearance Log</h2>
        {rows.length > 0 && (
          <span className="text-[10px] uppercase tracking-widest text-text-dimmed">
            {rows.length} mention{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-text-dimmed py-6">Loading appearances…</div>
      ) : rows.length === 0 ? (
        <div className="bg-fyrescribe-raised border border-border rounded-lg px-4 py-6 text-sm text-text-dimmed text-center">
          No mentions found. Run Sync Mentions to index this entity.
        </div>
      ) : (
        <>
          <div className="bg-fyrescribe-raised border border-border rounded-lg overflow-hidden">
            {pageRows.map((row, idx) => (
              <button
                key={row.id}
                onClick={() => handleNavigate(row.scene_id)}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-fyrescribe-hover border-b border-border last:border-b-0 ${
                  idx % 2 === 0 ? "bg-transparent" : "bg-fyrescribe-hover/40"
                }`}
              >
                <div className="font-prose text-[15px] leading-snug text-text-secondary">
                  …<HighlightedContext context={row.context} name={entityName} />…
                </div>
                <div className="mt-1.5 text-[11px] uppercase tracking-widest text-text-dimmed">
                  <span className="text-gold/80">{row.chapter_title}</span>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span>{row.scene_title}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between mt-3 text-[11px] text-text-dimmed">
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-widest">Show</span>
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setPageSize(opt);
                    setPage(1);
                  }}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    pageSize === opt
                      ? "border-gold/40 text-gold bg-gold/5"
                      : "border-border text-text-dimmed hover:text-foreground hover:border-text-dimmed"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-fyrescribe-hover hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-fyrescribe-hover hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AppearanceLog;
