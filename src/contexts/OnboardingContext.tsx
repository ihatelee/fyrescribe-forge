import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useActiveProject } from "./ProjectContext";
import OnboardingTour, { ONBOARDING_STEPS, type TourStep } from "@/components/OnboardingTour";

interface OnboardingContextValue {
  /** Manually start the tour (e.g. from Settings → Show Tutorial). */
  startTour: () => void;
  isActive: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  startTour: () => {},
  isActive: false,
});

export const useOnboarding = () => useContext(OnboardingContext);

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useActiveProject();
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const checkedRef = useRef(false);

  // ── Resolve dynamic routes for steps that depend on project / entity data ──
  const resolveRoute = useCallback(
    async (step: TourStep): Promise<string | null> => {
      if (!step.route) return null;

      // Tokens: {manuscript}, {entity}
      if (step.route === "{manuscript}") {
        return activeProject ? `/project/${activeProject.id}/manuscript` : "/manuscript";
      }
      if (step.route === "{entity}") {
        if (!activeProject) return "/world/characters";
        const { data } = await supabase
          .from("entities")
          .select("id")
          .eq("project_id", activeProject.id)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.id) return `/entity/${data.id}`;
        return "/world/characters";
      }
      return step.route;
    },
    [activeProject],
  );

  // Navigate (if needed) before the tour measures the next step's target.
  const handleNavigate = useCallback(
    async (step: TourStep) => {
      const target = await resolveRoute(step);
      if (!target) return;
      if (location.pathname !== target) {
        navigate(target);
      }
    },
    [navigate, location.pathname, resolveRoute],
  );

  // ── First-time auto-trigger ────────────────────────────────────────────
  useEffect(() => {
    if (!user || authLoading) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("has_completed_onboarding")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || error) return;
      if (!data || data.has_completed_onboarding === false) {
        // Brief delay so target elements are mounted/laid out.
        setTimeout(() => !cancelled && setActive(true), 600);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const finish = useCallback(async () => {
    setActive(false);
    // Always return to the manuscript at the end.
    if (activeProject) {
      navigate(`/project/${activeProject.id}/manuscript`);
    } else {
      navigate("/manuscript");
    }
    if (!user) return;
    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, has_completed_onboarding: true },
        { onConflict: "user_id" },
      );
    if (error) console.error("Failed to save onboarding state:", error);
  }, [user, activeProject, navigate]);

  const skip = useCallback(async () => {
    setActive(false);
    if (!user) return;
    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, has_completed_onboarding: true },
        { onConflict: "user_id" },
      );
    if (error) console.error("Failed to save onboarding state:", error);
  }, [user]);

  const startTour = useCallback(() => {
    // Make sure the manuscript page is mounted (step 1's target lives there).
    const manuscriptPath = activeProject
      ? `/project/${activeProject.id}/manuscript`
      : "/manuscript";
    if (!location.pathname.includes("/manuscript")) {
      navigate(manuscriptPath);
      setTimeout(() => setActive(true), 500);
    } else {
      setActive(true);
    }
  }, [activeProject, location.pathname, navigate]);

  const value = useMemo(
    () => ({ startTour, isActive: active }),
    [startTour, active],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {active && (
        <OnboardingTour
          steps={ONBOARDING_STEPS}
          onFinish={finish}
          onSkip={skip}
          onStepChange={handleNavigate}
        />
      )}
    </OnboardingContext.Provider>
  );
};
