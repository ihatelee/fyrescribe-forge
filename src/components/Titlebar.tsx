import { useState } from "react";
import { User, LogOut, FolderOpen, Pencil, Menu } from "lucide-react";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import logoBitSrc from "@/assets/fyrescribe_logo_bit.svg";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useTheme, isDaylightTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ThemeSwitcher from "./ThemeSwitcher";
import AccessibilityPanel from "./AccessibilityPanel";
import AmbiancePlayer from "./AmbiancePlayer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TitlebarProps {
  showSidebarToggle?: boolean;
}

const Titlebar = ({ showSidebarToggle = true }: TitlebarProps) => {
  const { activeProject, setActiveProject } = useActiveProject();
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const startEdit = () => {
    if (!activeProject) return;
    setEditTitle(activeProject.title);
    setEditing(true);
  };

  const saveEdit = async () => {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (!trimmed || !activeProject || trimmed === activeProject.title) return;
    setActiveProject({ ...activeProject, title: trimmed });
    await supabase.from("projects").update({ title: trimmed }).eq("id", activeProject.id);
  };

  const toggleMobileNav = () => {
    window.dispatchEvent(new CustomEvent("mobile-nav-toggle"));
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-20 bg-fyrescribe-base border-b border-border flex items-center justify-between px-3 lg:px-4 z-50">
      <div className="flex items-center gap-2 lg:gap-3 min-w-0 relative z-10">
        {showSidebarToggle && (
          <button
            onClick={toggleMobileNav}
            aria-label="Open navigation"
            className="lg:hidden p-2 -ml-1 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            <Menu size={18} />
          </button>
        )}
        <button onClick={() => navigate("/projects")} className="hover:opacity-80 transition-opacity group/logo flex-shrink-0">
          <img
            src={theme === "outrun" ? logoBitSrc : logoSrc}
            alt="Fyrescribe"
            className="h-[36px] lg:h-[44px] w-auto transition-[filter] duration-300 group-hover/logo:drop-shadow-[0_0_12px_hsl(var(--gold))]"
            style={isDaylightTheme(theme) ? { filter: "brightness(0)" } : undefined}
          />
        </button>
      </div>

      {activeProject && (
        <div data-tour="project-title" className="hidden lg:flex items-center gap-1.5 group absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none">
          {editing ? (
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="text-sm text-foreground bg-transparent border-b border-gold/50 outline-none px-1 pointer-events-auto"
            />
          ) : (
            <>
              <span className="text-text-secondary text-sm pointer-events-auto">{activeProject.title}</span>
              <button
                onClick={startEdit}
                className="text-text-dimmed hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 pointer-events-auto"
              >
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 lg:gap-4 relative z-10">
        <AmbiancePlayer />
        <div className="flex flex-col items-center gap-0.5">
          <AccessibilityPanel />
          <span className="hidden lg:inline text-[10px] text-text-dimmed">Settings</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <ThemeSwitcher />
          <span className="hidden lg:inline text-[10px] text-text-dimmed">Ambiance</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
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
          <span className="hidden lg:inline text-[10px] text-text-dimmed">Profile</span>
        </div>
      </div>
    </div>
  );
};

export default Titlebar;
