FIX — Cliquer "Voir" sur Vitips Express (page Intégrations transporteurs)
fait planter TOUTE l'application ("Une erreur inattendue s'est produite").
Même catégorie de bug que le crash du scanner caméra corrigé précédemment :
une exception non interceptée quelque part dans le rendu remonte jusqu'à
l'Error Boundary global de l'app.

────────────────────────────────────────────────────────────────────────────
ÉTAPE 1 (immédiate, préventive) — Isoler cette page avec un Error Boundary
LOCAL, pour qu'un bug dans une carte transporteur n'emporte plus jamais
toute l'application

Si le projet n'a pas encore de composant `ErrorBoundary` réutilisable,
en créer un dans client/src/components/error-boundary.tsx :

```tsx
import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          Un problème est survenu dans cette section.{" "}
          <button className="underline font-semibold" onClick={() => this.setState({ hasError: false, error: null })}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Puis, dans client/src/pages/shipping-integrations.tsx, envelopper au minimum
la modale de credentials (et idéalement chaque carte transporteur) :

```tsx
{viewingProvider && viewingMeta && (
  <ErrorBoundary fallback={
    <Dialog open onOpenChange={() => setViewingProvider(null)}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <p className="text-sm text-red-600">
          Impossible d'afficher les informations de connexion pour {viewingMeta.name} — un bug empêche l'affichage. L'équipe technique va corriger ça.
        </p>
      </DialogContent>
    </Dialog>
  }>
    <CredentialsModal
      providerId={viewingProvider}
      providerName={viewingMeta.name}
      onClose={() => setViewingProvider(null)}
      onAddNew={() => { setViewingProvider(null); setAddingProvider(viewingProvider); }}
    />
  </ErrorBoundary>
)}
```

Avec ça, même si le bug exact n'est pas encore trouvé, cliquer "Voir" sur
N'IMPORTE QUEL transporteur (Vitips ou autre, aujourd'hui ou dans le futur)
n'emportera plus jamais toute la plateforme — au pire, une carte d'erreur
localisée dans la modale.

────────────────────────────────────────────────────────────────────────────
ÉTAPE 2 — Trouver la cause exacte pour Vitips Express spécifiquement

Ouvrir la Console du navigateur (F12) AVANT de cliquer "Voir" sur Vitips
Express, cliquer, puis copier le message d'erreur complet ET la stack trace
qui apparaît en rouge dans la console (pas juste le toast visuel — le détail
technique). Points à vérifier en particulier dans le code, pistes probables :

- `acct.createdAt` : si le compte Vitips a été créé/inséré différemment des
  autres transporteurs (ex: script manuel, migration directe en base) et que
  `createdAt` est `null` ou dans un format inattendu, `new Date(acct.createdAt)`
  peut produire un comportement différent selon le format exact stocké.
- Vérifier que `acct.assignmentRule`, `acct.storeName`, et tout autre champ
  lu sans `?.` (optional chaining) dans `CredentialsModal` a bien une valeur
  pour les comptes Vitips — comparer une ligne de la table `carrier_accounts`
  pour un compte Vitips vs un compte Express Coursier qui fonctionne, colonne
  par colonne, pour repérer un champ NULL chez Vitips qui ne l'est jamais
  chez les autres transporteurs.

────────────────────────────────────────────────────────────────────────────
DÉPLOIEMENT
git add -A && git commit -m "Add local ErrorBoundary around carrier credentials modal to prevent app-wide crashes" && git push

VÉRIFICATION
1. Cliquer "Voir" sur Vitips Express → soit ça marche maintenant (si le
   bug était bénin), soit une carte d'erreur LOCALISÉE apparaît — dans les
   deux cas, le reste de la plateforme (menu, autres pages) reste utilisable,
   plus d'écran "Une erreur inattendue s'est produite" qui bloque tout.
2. Coller-moi le message d'erreur exact de la console (ÉTAPE 2) si le
   problème persiste, pour un correctif ciblé sur la cause précise.
