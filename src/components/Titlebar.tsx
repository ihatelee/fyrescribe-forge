import { Settings, User } from "lucide-react";

interface TitlebarProps {
  projectName?: string;
}

const Titlebar = ({ projectName }: TitlebarProps) => {
  return (
    <div className="fixed top-0 left-0 right-0 h-12 bg-fyrescribe-base border-b border-border flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-3">
        <span className="font-display text-[22px] leading-none tracking-wide text-foreground select-none">
          Fyrescribe
        </span>
      </div>

      {projectName && (
        <span className="text-text-secondary text-sm hidden sm:block">
          {projectName}
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
