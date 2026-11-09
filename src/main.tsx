import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// If a deploy lands while a tab is open, that tab's old code chunks no longer
// exist on the server. Reload once to pick up the new build instead of
// leaving the user on a broken screen. (Guarded so it can't loop.)
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "fyrescribe_chunk_reload_at";
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(KEY, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
