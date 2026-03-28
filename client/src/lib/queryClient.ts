import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    let isSuspended = false;
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
      if (json.detail) message = `${json.message} (${json.detail})`;
      if (res.status === 403 && json.suspended) {
        isSuspended = true;
        localStorage.setItem("suspended_message", json.message);
        fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        window.location.replace("/");
      }
    } catch {
      // Response was not JSON (e.g. HTML from a proxy error page)
      if (text.trim().startsWith("<")) {
        message = `Erreur serveur (${res.status}) — vérifiez les logs Railway`;
      }
    }
    if (isSuspended) throw new Error("AccountSuspended");
    throw new Error(`${res.status}: ${message}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 300000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
