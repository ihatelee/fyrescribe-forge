import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Hardcoded Supabase fallbacks — these are PUBLIC values (project URL + anon key)
// and are safe to ship in the bundle. Used as a safety net in case the build
// environment fails to inject the VITE_SUPABASE_* env vars at build time.
const SUPABASE_URL_FALLBACK = "https://bedrzyekoynnzdeblunt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlZHJ6eWVrb3lubnpkZWJsdW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjQ4NjksImV4cCI6MjA5MTUwMDg2OX0.ZnwPs0yn7qVCk925uinPmO88xeO4tINS6xxUXd5ocJU";
const SUPABASE_PROJECT_ID_FALLBACK = "bedrzyekoynnzdeblunt";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        env.VITE_SUPABASE_URL || SUPABASE_URL_FALLBACK,
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY_FALLBACK,
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        env.VITE_SUPABASE_PROJECT_ID || SUPABASE_PROJECT_ID_FALLBACK,
      ),
    },
  };
});
