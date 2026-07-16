import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";

export function PwaUpdateToast() {
  const { toast } = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onOfflineReady() {
      console.info("[PWA] Application prête en mode hors ligne.");
    },
    onRegisterError(err) {
      console.warn("[PWA] Erreur d'enregistrement du service worker:", err);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const { dismiss } = toast({
      title: "Nouvelle version disponible",
      description: "Cliquez pour mettre à jour l'application.",
      duration: 0,
      action: (
        <button
          onClick={() => {
            dismiss();
            updateServiceWorker(true);
          }}
          className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white
                     hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
          data-testid="button-pwa-update"
        >
          Actualiser
        </button>
      ) as any,
    });
    return () => {
      setNeedRefresh(false);
    };
  }, [needRefresh]);

  return null;
}
