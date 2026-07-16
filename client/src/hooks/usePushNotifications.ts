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
      (!ios || pwa); // iOS push only works in installed PWA
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
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const res = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await res.json();
      if (!publicKey) return false;

      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = pushSub.toJSON() as any;
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 500),
      });

      setSubscribed(true);
      return true;
    } catch (e) {
      console.error("[Push] subscribe error:", e);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (): Promise<void> => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await apiRequest("DELETE", "/api/push/unsubscribe", { endpoint: pushSub.endpoint });
        await pushSub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error("[Push] unsubscribe error:", e);
    } finally {
      setLoading(false);
    }
  };

  return { permission, subscribed, loading, isSupported, isIOS, isPWA, subscribe, unsubscribe };
}
