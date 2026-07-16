import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/index";

/* ── Service Worker registration ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.info('[SW] Registered, scope:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

const savedLang = localStorage.getItem("tajer_lang") || "fr";
const isRtl = savedLang === "ar";
document.documentElement.dir = isRtl ? "rtl" : "ltr";
document.documentElement.lang = savedLang;
if (isRtl) document.documentElement.classList.add("rtl");

createRoot(document.getElementById("root")!).render(<App />);
