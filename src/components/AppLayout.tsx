import { ReactNode } from "react";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

const AppLayout = ({ children, showSidebar = true }: AppLayoutProps) => {
  return (
    <div className="min-h-screen">
      <Titlebar />
      {showSidebar && <Sidebar />}
      <main
        className={`pt-20 ${showSidebar ? "pl-[190px]" : ""} min-h-screen`}
      >
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
