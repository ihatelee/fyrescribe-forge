import { Settings, User, LogOut, FolderOpen } from "lucide-react";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Titlebar = () => {
  const { activeProject } = useActiveProject();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-12 bg-fyrescribe-base border-b border-border flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/projects")} className="hover:opacity-80 transition-opacity">
          <img src={logoSrc} alt="Fyrescribe" className="h-[22px] w-auto" />
        </button>
      </div>

      {activeProject && (
        <span className="text-text-secondary text-sm hidden sm:block">
          {activeProject.title}
        </span>
      )}

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-7 h-7 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-secondary hover:text-foreground transition-colors">
              <User size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            <DropdownMenuItem onClick={() => navigate("/projects")} className="cursor-pointer">
              <FolderOpen size={14} className="mr-2" />
              Your Projects
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
              <LogOut size={14} className="mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default Titlebar;
