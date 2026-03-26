import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  storeId: number | null;
  paymentType: string | null;
  paymentAmount: number | null;
  distributionMethod: string | null;
  isActive: number | null;
  isSuperAdmin: number | null;
  isEmailVerified: number | null;
  createdAt: string | null;
  dashboardPermissions: Record<string, boolean> | null;
  buyerCode: string | null;
  isImpersonating?: boolean;
  originalSuperAdminId?: number | null;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (storeName: string, username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginMutation: ReturnType<typeof useMutation>;
  signupMutation: ReturnType<typeof useMutation>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await fetch("/api/user", { credentials: "include" });
      if (res.status === 401) return null;
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json.suspended) {
          localStorage.setItem("suspended_message", json.message || "Votre compte est suspendu.");
          fetch("/api/auth/logout", { method: "POST", credentials: "include" });
          window.location.replace("/");
        }
        return null;
      }
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    staleTime: 30000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data);
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      toast({ title: "Erreur de connexion", description: err.message.replace(/^\d+:\s*/, ''), variant: "destructive" });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async ({ storeName, username, email, password }: { storeName: string; username: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/signup", { storeName, username, email, password });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data);
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      toast({ title: "Erreur d'inscription", description: err.message.replace(/^\d+:\s*/, ''), variant: "destructive" });
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const signup = async (storeName: string, username: string, email: string, password: string) => {
    await signupMutation.mutateAsync({ storeName, username, email, password });
  };

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.setQueryData(["/api/user"], null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, signup, logout, loginMutation, signupMutation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
