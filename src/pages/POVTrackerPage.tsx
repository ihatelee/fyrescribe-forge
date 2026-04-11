import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_CHAPTERS } from "@/lib/placeholder-data";

const POV_COLORS: Record<string, string> = {
  Kael: "bg-blue-500/20 text-blue-300",
  Sera: "bg-purple-500/20 text-purple-300",
  Maren: "bg-green-500/20 text-green-300",
  Lirae: "bg-red-500/20 text-red-300",
};

const POVTrackerPage = () => {
  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="font-display text-xl text-foreground tracking-wide mb-6">
          POV Tracker
        </h1>

        <div className="bg-fyrescribe-raised border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed">
                  Chapter
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed">
                  Scene
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed">
                  POV Character
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-text-dimmed">
                  Words
                </th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_CHAPTERS.flatMap((chapter) =>
                chapter.scenes.map((scene, sceneIdx) => (
                  <tr
                    key={scene.id}
                    className="border-b border-border last:border-0 hover:bg-fyrescribe-hover transition-colors"
                  >
                    <td className="px-4 py-2.5 text-sm text-text-secondary">
                      {sceneIdx === 0 ? chapter.title : ""}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-foreground">
                      {scene.title}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full ${
                          POV_COLORS[scene.pov] || "bg-fyrescribe-hover text-text-secondary"
                        }`}
                      >
                        {scene.pov}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-text-dimmed text-right">
                      {scene.wordCount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default POVTrackerPage;
