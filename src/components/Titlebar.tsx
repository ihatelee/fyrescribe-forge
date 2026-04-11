import { Settings, User } from "lucide-react";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import { useActiveProject } from "@/contexts/ProjectContext";

const Titlebar = () => {
  const { activeProject } = useActiveProject();

  return (
    <div className="fixed top-0 left-0 right-0 h-12 bg-fyrescribe-base border-b border-border flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-3">
        <img src={logoSrc} alt="Fyrescribe" className="h-[22px] w-auto" />
      </div>

      {activeProject && (
        <span className="text-text-secondary text-sm hidden sm:block">
          {activeProject.title}
        </span>
      )}

      <div className="flex items-center gap-2">
        <button className="p-2 rounded-md text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors">
          <Settings size={16} />
        </button>
        <button className="w-7 h-7 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-secondary hover:text-foreground transition-colors">
          <User size={14} />
        </button>
      </div>
    </div>
  );
};

export default Titlebar;
