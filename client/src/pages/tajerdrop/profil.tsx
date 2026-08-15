import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, Phone, Mail, Save } from "lucide-react";

const GOLD = "#C5A059";
const NAVY = "#0f1e38";

export default function TajerDropProfil() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      username: (user as any)?.username || "",
      email:    (user as any)?.email    || "",
      phone:    (user as any)?.phone    || "",
    },
  });

  const save = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/user/profile", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Profil mis à jour" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mon profil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vos informations de compte Seller</p>
      </div>

      {/* Account info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" style={{ color: GOLD }} />
            Informations personnelles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Nom complet</Label>
              <Input id="username" {...register("username")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full text-white"
              style={{ background: GOLD }}
            >
              <Save className="w-4 h-4 mr-2" />
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Status badge */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "#16a34a18" }}>
            <User className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Statut du compte</p>
            <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              ✓ Seller TajerDrop validé
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
