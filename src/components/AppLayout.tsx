import { ReactNode, useEffect, useState } from "react";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

const AppLayout = ({ children, showSidebar = true }: AppLayoutProps) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setMobileNavOpen((v) => !v);
    const close = () => setMobileNavOpen(false);
    window.addEventListener("mobile-nav-toggle", toggle);
    window.addEventListener("mobile-nav-close", close);
    return () => {
      window.removeEventListener("mobile-nav-toggle", toggle);
      window.removeEventListener("mobile-nav-close", close);
    };
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileNavOpen]);

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <Titlebar showSidebarToggle={showSidebar} />

      {showSidebar && (
        <>
          {/* Desktop sidebar (always visible >= md) */}
          <div className="hidden md:block">
            <Sidebar />
          </div>

          {/* Mobile drawer */}
          {mobileNavOpen && (
            <>
              <div
                className="md:hidden fixed inset-0 top-20 bg-background/70 backdrop-blur-sm z-40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="md:hidden fixed left-0 top-20 bottom-0 z-50 animate-in slide-in-from-left duration-200">
                <Sidebar />
              </div>
            </>
          )}
        </>
      )}

      <main
        className={`flex-1 min-h-0 pt-20 ${showSidebar ? "md:pl-[190px]" : ""} overflow-auto`}
      >
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
