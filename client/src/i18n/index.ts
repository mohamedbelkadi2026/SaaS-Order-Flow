import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      ar: { translation: ar },
      en: { translation: en },
    },
    fallbackLng: "fr",
    lng: localStorage.getItem("tajer_lang") || "fr",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "tajer_lang",
    },
    interpolation: {
      escapeValue: false,
    },
  });

export function setLanguage(lang: "fr" | "ar" | "en") {
  i18n.changeLanguage(lang);
  localStorage.setItem("tajer_lang", lang);
  const isRtl = lang === "ar";
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  document.documentElement.lang = lang;
  document.documentElement.classList.toggle("rtl", isRtl);
}

export default i18n;
