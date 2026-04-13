import { ReactNode } from "react";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

const AppLayout = ({ children, showSidebar = true }: AppLayoutProps) => {
  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <Titlebar />
      {showSidebar && <Sidebar />}
      <main
        className={`flex-1 min-h-0 pt-20 ${showSidebar ? "pl-[190px]" : ""} overflow-auto`}
      >
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
