import { useState, useEffect, useRef } from "react";
import { X, Download, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Detect iOS/iPadOS (no beforeinstallprompt support) */
function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
}

function isInStandaloneMode(): boolean {
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

const DISMISSED_KEY = 'pwa_prompt_dismissed';

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAndroid, setShowAndroid]       = useState(false);
  const [showIos, setShowIos]               = useState(false);
  const [installed, setInstalled]           = useState(false);
  const listenedRef                         = useRef(false);

  useEffect(() => {
    /* Already installed or user dismissed recently */
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    /* iOS — show manual instructions after a short delay */
    if (isIos()) {
      const t = setTimeout(() => setShowIos(true), 3000);
      return () => clearTimeout(t);
    }

    /* Android / Desktop Chrome — listen for browser prompt */
    if (listenedRef.current) return;
    listenedRef.current = true;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowAndroid(true);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setShowAndroid(false);
    setShowIos(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setShowAndroid(false);
    setDeferredPrompt(null);
  }

  if (installed || (!showAndroid && !showIos)) return null;

  /* ── Android / Desktop prompt ── */
  if (showAndroid) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm
                   bg-[#1E1B4B] border border-indigo-500/40 rounded-2xl shadow-2xl shadow-black/40
                   p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300"
        data-testid="pwa-android-prompt"
      >
        <img src="/android-chrome-192.png" alt="Tajergrow" className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Installer l'application</p>
          <p className="text-indigo-300 text-xs mt-0.5 leading-snug">
            Ajoutez Tajergrow à votre écran d'accueil pour un accès rapide.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleInstall}
              className="h-8 px-4 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              data-testid="button-pwa-install">
              <Download className="w-3.5 h-3.5" /> Installer
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}
              className="h-8 px-3 text-indigo-300 hover:text-white hover:bg-white/10 text-xs rounded-lg"
              data-testid="button-pwa-dismiss">
              Plus tard
            </Button>
          </div>
        </div>
        <button onClick={dismiss} className="text-indigo-400 hover:text-white shrink-0 mt-0.5" data-testid="button-pwa-close">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  /* ── iOS manual instructions ── */
  if (showIos) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm
                   bg-[#1E1B4B] border border-indigo-500/40 rounded-2xl shadow-2xl shadow-black/40
                   p-4 animate-in slide-in-from-bottom-4 duration-300"
        data-testid="pwa-ios-prompt"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img src="/android-chrome-192.png" alt="Tajergrow" className="w-9 h-9 rounded-xl" />
            <p className="text-white font-semibold text-sm">Installer l'application</p>
          </div>
          <button onClick={dismiss} className="text-indigo-400 hover:text-white" data-testid="button-pwa-ios-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-indigo-200 text-xs leading-relaxed">
          Pour installer Tajergrow sur votre iPhone&nbsp;:
        </p>
        <ol className="mt-2 space-y-1.5">
          <li className="flex items-center gap-2 text-xs text-indigo-100">
            <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
            Appuyez sur <Share className="w-3.5 h-3.5 mx-0.5 shrink-0 text-blue-400" />{" "}
            <span className="font-semibold">Partager</span> dans Safari
          </li>
          <li className="flex items-center gap-2 text-xs text-indigo-100">
            <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
            <Plus className="w-3.5 h-3.5 shrink-0 text-blue-400" />
            Choisissez <span className="font-semibold ml-0.5">«&nbsp;Sur l'écran d'accueil&nbsp;»</span>
          </li>
          <li className="flex items-center gap-2 text-xs text-indigo-100">
            <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
            Appuyez sur <span className="font-semibold ml-0.5">«&nbsp;Ajouter&nbsp;»</span>
          </li>
        </ol>
      </div>
    );
  }

  return null;
}
