import { useLocation } from "react-router-dom";
import AmbianceAudioHost from "./AmbianceAudioHost";

/**
 * Only mount the ambiance audio host when the user is inside a project.
 * Landing page (/), auth (/), /projects, and /onboarding stay silent.
 */
const PROJECT_ROUTE_PREFIXES = [
  "/project/",
  "/manuscript",
  "/world",
  "/entity/",
  "/timeline",
  "/pov-tracker",
  "/lore-inbox",
  "/notes",
];

const AmbianceAudioGate = () => {
  const { pathname } = useLocation();
  const inProject = PROJECT_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  if (!inProject) return null;
  return <AmbianceAudioHost />;
};

export default AmbianceAudioGate;
