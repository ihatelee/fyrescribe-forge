import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectProvider } from "./contexts/ProjectContext";
import ProjectsPage from "./pages/ProjectsPage";
import ManuscriptPage from "./pages/ManuscriptPage";
import EntityGalleryPage from "./pages/EntityGalleryPage";
import EntityDetailPage from "./pages/EntityDetailPage";
import TimelinePage from "./pages/TimelinePage";
import POVTrackerPage from "./pages/POVTrackerPage";
import LoreInboxPage from "./pages/LoreInboxPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ProjectProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/manuscript" element={<ManuscriptPage />} />
            <Route path="/world/:category" element={<EntityGalleryPage />} />
            <Route path="/world" element={<EntityGalleryPage />} />
            <Route path="/entity/:id" element={<EntityDetailPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/pov-tracker" element={<POVTrackerPage />} />
            <Route path="/lore-inbox" element={<LoreInboxPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ProjectProvider>
  </QueryClientProvider>
);

export default App;
