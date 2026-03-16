import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/index";

const savedLang = localStorage.getItem("tajer_lang") || "fr";
const isRtl = savedLang === "ar";
document.documentElement.dir = isRtl ? "rtl" : "ltr";
document.documentElement.lang = savedLang;
if (isRtl) document.documentElement.classList.add("rtl");

createRoot(document.getElementById("root")!).render(<App />);
