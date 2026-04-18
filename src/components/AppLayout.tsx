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
    <div className="h-[100dvh] overflow-hidden flex flex-col">
      <Titlebar showSidebarToggle={showSidebar} />

      {showSidebar && (
        <>
          {/* Desktop sidebar (always visible >= lg) */}
          <div className="hidden lg:block fixed left-0 top-20 bottom-0 w-[190px] z-40">
            <Sidebar />
          </div>

          {/* Mobile / tablet-portrait drawer */}
          {mobileNavOpen && (
            <>
              <div
                className="lg:hidden fixed inset-0 top-20 bg-background/70 backdrop-blur-sm z-40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="lg:hidden fixed left-0 top-20 bottom-0 w-[190px] z-50 animate-in slide-in-from-left duration-200 overflow-y-auto">
                <Sidebar />
              </div>
            </>
          )}
        </>
      )}

      <main
        className={`flex-1 min-h-0 pt-20 ${showSidebar ? "lg:pl-[190px]" : ""} overflow-auto`}
      >
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
