import { useTheme } from "@/contexts/ThemeContext";
import StarfieldBackground from "./StarfieldBackground";
import OutrunGridBackground from "./OutrunGridBackground";

const GlobalSparkle = () => {
  const { sparkle, theme } = useTheme();
  if (!sparkle) return null;
  if (theme === "outrun") return <OutrunGridBackground />;
  return <StarfieldBackground />;
};

export default GlobalSparkle;
