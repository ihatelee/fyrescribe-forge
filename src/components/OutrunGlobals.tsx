import { useTheme } from "@/contexts/ThemeContext";
import OutrunMusicPlayer from "./OutrunMusicPlayer";

/**
 * Renders outrun-theme-specific global UI that must persist across route
 * changes (i.e. survive navigation without remounting). Rendered once in
 * App.tsx alongside GlobalSparkle, outside the route tree.
 *
 * Currently contains: the music player, fixed to the bottom of the sidebar.
 */
const OutrunGlobals = () => {
  const { theme } = useTheme();
  if (theme !== "outrun") return null;

  return (
    // Positioned to overlap the bottom of the left sidebar (w-[190px], z-40).
    // z-[45] sits above the sidebar so the player card renders cleanly on top.
    <div className="fixed left-0 bottom-0 w-[190px] z-[45] bg-fyrescribe-base">
      <OutrunMusicPlayer />
    </div>
  );
};

export default OutrunGlobals;
