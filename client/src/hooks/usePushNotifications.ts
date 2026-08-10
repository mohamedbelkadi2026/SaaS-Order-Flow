import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const pwa =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsIOS(ios);
    setIsPWA(pwa);
    const supported =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      (!ios || pwa);
    setIsSupported(supported);
    if ("Notification" in window) setPermission(Notification.permission);
    if (supported) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {});
    }
  }, []);

  const subscribe = async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Permission refusée. Activez les notifications dans les paramètres du navigateur.");
        return false;
      }

      const res = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await res.json();
      if (!publicKey) {
        setError("Configuration serveur manquante (VAPID). Contactez l'administrateur.");
        return false;
      }

      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Service worker timeout — rechargez la page et réessayez.")), 10_000)
        ),
      ]) as ServiceWorkerRegistration;

      let pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        // Existing browser subscription — unsubscribe first so we get a fresh one
        // with the current VAPID key (avoids key-mismatch errors after key rotation)
        await pushSub.unsubscribe();
      }

      pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = pushSub.toJSON() as any;
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint:  json.endpoint,
        p256dh:    json.keys.p256dh,
        auth:      json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 500),
      });

      setSubscribed(true);
      return true;
    } catch (e: any) {
      const msg = e?.message || "Erreur lors de l'inscription aux notifications.";
      setError(msg);
      console.error("[Push] subscribe error:", e);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await apiRequest("DELETE", "/api/push/unsubscribe", { endpoint: pushSub.endpoint });
        await pushSub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la désinscription.");
      console.error("[Push] unsubscribe error:", e);
    } finally {
      setLoading(false);
    }
  };

  return { permission, subscribed, loading, error, isSupported, isIOS, isPWA, subscribe, unsubscribe };
}
