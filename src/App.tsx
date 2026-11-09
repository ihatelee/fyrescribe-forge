import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hasUnsavedWork } from "@/lib/saveStatus";
import { ProjectProvider } from "./contexts/ProjectContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import ProtectedRoute from "./components/ProtectedRoute";
import GlobalSparkle from "./components/GlobalSparkle";
import OutrunGlobals from "./components/OutrunGlobals";
import AmbianceAudioGate from "./components/AmbianceAudioGate";
import AuthPage from "./pages/AuthPage";

// Route-level code splitting: each page ships as its own chunk instead of one
// 1.5 MB bundle. All chunks are prefetched in the background once the browser
// is idle, so in-app navigation stays instant after the first load.
const pageLoaders = {
  projects: () => import("./pages/ProjectsPage"),
  onboarding: () => import("./pages/OnboardingPage"),
  manuscript: () => import("./pages/ManuscriptPage"),
  gallery: () => import("./pages/EntityGalleryPage"),
  entity: () => import("./pages/EntityDetailPage"),
  timeline: () => import("./pages/TimelinePage"),
  pov: () => import("./pages/POVTrackerPage"),
  loreInbox: () => import("./pages/LoreInboxPage"),
  notes: () => import("./pages/NotesPage"),
  notFound: () => import("./pages/NotFound"),
};
const ProjectsPage = lazy(pageLoaders.projects);
const OnboardingPage = lazy(pageLoaders.onboarding);
const ManuscriptPage = lazy(pageLoaders.manuscript);
const EntityGalleryPage = lazy(pageLoaders.gallery);
const EntityDetailPage = lazy(pageLoaders.entity);
const TimelinePage = lazy(pageLoaders.timeline);
const POVTrackerPage = lazy(pageLoaders.pov);
const LoreInboxPage = lazy(pageLoaders.loreInbox);
const NotesPage = lazy(pageLoaders.notes);
const NotFound = lazy(pageLoaders.notFound);

const prefetchPages = () => {
  for (const load of Object.values(pageLoaders)) load().catch(() => {});
};
if (typeof window !== "undefined") {
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(prefetchPages);
  else setTimeout(prefetchPages, 1500);
}

const queryClient = new QueryClient();

const App = () => {
  // Warn before leaving the tab while a save is still queued or retrying,
  // so unsaved work (or a save stuck offline) isn't silently lost.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWork()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
      <ProjectProvider>
        <TooltipProvider>
          <GlobalSparkle />
          <OutrunGlobals />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AmbianceAudioGate />
            <OnboardingProvider>
              <Suspense fallback={null}>
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
                <Route path="/notes" element={<ProtectedRoute><NotesPage /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </OnboardingProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ProjectProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
