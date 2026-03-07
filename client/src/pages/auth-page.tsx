import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Store, Lock, Mail, User } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const { login, signup, loginMutation, signupMutation } = useAuth();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [storeName, setStoreName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(storeName, username, email, password);
      }
      setLocation("/");
    } catch {}
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3b5998] via-[#4a6baf] to-[#2d4373] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="text-white space-y-6 px-4">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-bold text-2xl">
              G
            </div>
            <span className="font-bold text-3xl tracking-tight">Garean</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
            Gérez vos commandes<br />comme un pro
          </h1>
          <p className="text-white/80 text-lg max-w-md">
            La plateforme SaaS de gestion des commandes conçue pour les e-commerçants marocains. 
            Suivi des commandes, gestion d'équipe, et calcul de rentabilité en temps réel.
          </p>
          <div className="flex gap-4 text-white/60 text-sm">
            <span className="flex items-center gap-1">✓ Multi-boutiques</span>
            <span className="flex items-center gap-1">✓ Équipe illimitée</span>
            <span className="flex items-center gap-1">✓ Shopify sync</span>
          </div>
        </div>

        <Card className="rounded-2xl shadow-2xl border-0 overflow-hidden" data-testid="auth-card">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-800" data-testid="auth-title">
                {isLogin ? "Connexion" : "Créer un compte"}
              </h2>
              <p className="text-slate-500 mt-1 text-sm">
                {isLogin ? "Bienvenue ! Connectez-vous à votre espace." : "Lancez votre business en quelques secondes."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Nom de la boutique</label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        data-testid="input-store-name"
                        placeholder="Ma Boutique"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        className="pl-10 h-11 bg-slate-50 border-slate-200"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Nom complet</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        data-testid="input-username"
                        placeholder="Mohamed"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="pl-10 h-11 bg-slate-50 border-slate-200"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    data-testid="input-email"
                    type="email"
                    placeholder="email@garean.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 bg-slate-50 border-slate-200"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    data-testid="input-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 bg-slate-50 border-slate-200"
                    required
                    minLength={4}
                  />
                </div>
              </div>

              <Button
                data-testid="button-submit"
                type="submit"
                disabled={isPending}
                className="w-full h-11 bg-[#3b5998] hover:bg-[#2d4373] text-white font-bold mt-2"
              >
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isLogin ? "Se connecter" : "Créer mon compte"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                data-testid="button-toggle-auth"
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-[#3b5998] hover:underline font-medium"
              >
                {isLogin ? "Pas encore de compte ? Inscrivez-vous" : "Déjà un compte ? Connectez-vous"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
