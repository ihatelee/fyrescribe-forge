import { ReactNode } from "react";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";
import OutrunMusicPlayer from "./OutrunMusicPlayer";
import { useTheme } from "@/contexts/ThemeContext";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

const AppLayout = ({ children, showSidebar = true }: AppLayoutProps) => {
  const { theme } = useTheme();
  const isOutrun = theme === "outrun";

  return (
    <div className="min-h-screen">
      <Titlebar />
      {showSidebar && <Sidebar />}

      {/* Outrun right panel — music player pinned to the bottom */}
      {isOutrun && (
        <div className="fixed right-0 top-20 bottom-0 w-[180px] bg-fyrescribe-base border-l border-border flex flex-col z-40">
          <div className="flex-1" />
          <OutrunMusicPlayer />
        </div>
      )}

      <main
        className={`pt-20 ${showSidebar ? "pl-[190px]" : ""} ${isOutrun ? "pr-[180px]" : ""} min-h-screen`}
      >
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
