import { useTheme } from "@/contexts/ThemeContext";
import StarfieldBackground from "./StarfieldBackground";

const GlobalSparkle = () => {
  const { sparkle } = useTheme();
  if (!sparkle) return null;
  return <StarfieldBackground />;
};

export default GlobalSparkle;
