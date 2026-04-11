import { ReactNode } from "react";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
  projectName?: string;
  showSidebar?: boolean;
}

const AppLayout = ({ children, projectName, showSidebar = true }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-fyrescribe-deepest">
      <Titlebar projectName={projectName} />
      {showSidebar && <Sidebar />}
      <main
        className={`pt-12 ${showSidebar ? "pl-[190px]" : ""} min-h-screen`}
      >
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
