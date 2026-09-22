import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/index";


// Production resilience: after a deployment, an already-open tab/PWA can still
// reference an old hashed JS chunk. Recover once automatically instead of
// leaving the user on a fatal error screen.
const CHUNK_RECOVERY_KEY = "tajergrow_chunk_recovery";
const isChunkLoadFailure = (value: unknown) => {
  const message = String(
    (value as any)?.message ??
    (value as any)?.reason?.message ??
    (value as any)?.reason ??
    value ??
    ""
  ).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror") ||
    message.includes("importing a module script failed")
  );
};

const recoverFromStaleChunk = (value: unknown) => {
  if (!isChunkLoadFailure(value)) return;
  if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === "1") return;
  sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
  window.location.reload();
};

window.addEventListener("error", (event) => recoverFromStaleChunk(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => recoverFromStaleChunk(event.reason));

// A successful page load clears the one-shot guard, so a later deployment can
// recover in the same browser session as well.
window.setTimeout(() => sessionStorage.removeItem(CHUNK_RECOVERY_KEY), 10000);


const savedLang = localStorage.getItem("tajer_lang") || "fr";
const isRtl = savedLang === "ar";
document.documentElement.dir = isRtl ? "rtl" : "ltr";
document.documentElement.lang = savedLang;
if (isRtl) document.documentElement.classList.add("rtl");

createRoot(document.getElementById("root")!).render(<App />);
