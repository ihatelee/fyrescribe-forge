import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectProvider } from "./contexts/ProjectContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import GlobalSparkle from "./components/GlobalSparkle";
import AuthPage from "./pages/AuthPage";
import ProjectsPage from "./pages/ProjectsPage";
import OnboardingPage from "./pages/OnboardingPage";
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
    <AuthProvider>
      <ThemeProvider>
      <ProjectProvider>
        <TooltipProvider>
          <GlobalSparkle />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AuthPage />} />
              <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
              <Route path="/project/:projectId/manuscript" element={<ProtectedRoute><ManuscriptPage /></ProtectedRoute>} />
              <Route path="/manuscript" element={<ProtectedRoute><ManuscriptPage /></ProtectedRoute>} />
              <Route path="/world/:category" element={<ProtectedRoute><EntityGalleryPage /></ProtectedRoute>} />
              <Route path="/world" element={<ProtectedRoute><EntityGalleryPage /></ProtectedRoute>} />
              <Route path="/entity/:id" element={<ProtectedRoute><EntityDetailPage /></ProtectedRoute>} />
              <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
              <Route path="/pov-tracker" element={<ProtectedRoute><POVTrackerPage /></ProtectedRoute>} />
              <Route path="/lore-inbox" element={<ProtectedRoute><LoreInboxPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ProjectProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
