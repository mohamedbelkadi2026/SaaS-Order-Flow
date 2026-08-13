# Replit Prompt — Intégration complète du transporteur Waselex (prêt à exécuter tel quel)

## Objectif
Ajouter Waselex comme nouveau transporteur, pleinement fonctionnel à 100% : création de commandes, suivi automatique des statuts (par polling, pas de webhook chez eux), gestion des villes, logo dans l'UI. Suivre exactement le pattern déjà utilisé pour les transporteurs existants (Ameex, Vitipsexpress, Ozonexpress, Digylog, Expresscoursier) dans server/services/carrier-service.ts.

Un fichier logo waselex-logo.png est fourni séparément — l'utiliser comme icône du transporteur partout où les logos des autres transporteurs apparaissent (liste des transporteurs à connecter, badge sur les commandes, page Suivi des Colis, etc.), au format déjà utilisé pour les autres logos du projet.

---

## 1. Informations d'authentification

- URL de base : https://waselex.ma/api/vendor/v1
- Authentification par header, deux formats acceptés :
  - X-Api-Key: VOTRE_CLE_API
  - ou Authorization: Bearer VOTRE_CLE_API
- Stocker la clé API par store dans carrier_accounts (comme pour les autres transporteurs), avec un champ dédié dans l'UI de connexion des transporteurs.
- Ajouter waselex dans le registre des providers (URL de base, nom d'affichage "Waselex", logo).

---

## 2. Création de commande — POST /orders

Envoi possible en unitaire ou en lot : {"orders": [ {...}, {...} ]} (max 200 par requête). Validation tout-ou-rien : si une commande est invalide, aucune n'est créée.

### Mapping des champs (commande interne vers Waselex)

| Champ interne | Champ Waselex | Type | Obligatoire | Règle |
|---|---|---|---|---|
| customerName | client_name | string | oui | max 255 |
| customerPhone | client_phone | string | oui | exactement 10 chiffres commençant par 0 (reformater depuis +212XXXXXXXXX vers 0XXXXXXXXX) |
| customerAddress | client_address | string | oui | |
| ville résolue via table waselex_cities | city_id | integer | oui (ou city) | privilégier city_id si résolu, sinon fallback city (nom exact) |
| rawProductName / nom produit | product_name | string | oui | max 500 |
| montant COD total commande | price | number | oui | >= 0 |
| quantité totale | quantity | integer | non | défaut 1 |
| — | can_open | boolean | non | défaut false, mapper si l'app a un équivalent "colis ouvrable" |
| — | has_change | boolean | non | défaut false, mapper si commande de type échange |
| notes internes | notes | string | non | max 1000 |
| orderNumber | external_ref | string | non | max 100, sert à faire le lien retour dans les réponses |

### Exemple de requête
```
curl -X POST "https://waselex.ma/api/vendor/v1/orders" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: VOTRE_CLE_API" \
  -d '{
    "orders": [{
      "client_name": "Ahmed Benali",
      "client_phone": "0612345678",
      "client_address": "12 Rue Hassan II, Quartier Maarif",
      "city": "Casablanca",
      "product_name": "Montre connectée X200",
      "price": 299.00,
      "quantity": 1,
      "notes": "Appeler avant livraison",
      "external_ref": "CMD-1058"
    }]
  }'
```

### Réponse succès — 201 Created
```
{
  "success": true,
  "created_count": 1,
  "orders": [{
    "order_id": 15234,
    "tracking_code": "WSL-20260612143015XYZ4",
    "external_ref": "CMD-1058",
    "status": "EN_ATTENTE_RAMASSAGE",
    "city": "Casablanca",
    "delivery_fee": 25.00
  }]
}
```
Stocker tracking_code comme trackingNumber de la commande (comme extractTracking() pour les autres providers), et delivery_fee comme frais de livraison affiché.

### Réponse erreur — 422 (aucune commande créée)
```
{
  "success": false,
  "error": "Validation échouée — aucune commande créée.",
  "errors": ["orders[0].client_phone doit contenir exactement 10 chiffres (format marocain, ex: 0612345678)"]
}
```
Remonter le contenu de errors[] comme carrierMessage, ne pas créer de tracking côté app.

### Autres codes d'erreur
| Code | Signification | Comportement attendu |
|---|---|---|
| 400 | Requête mal formée | Erreur bloquante, à logger |
| 401 | Clé API invalide/manquante/compte non approuvé | Afficher clairement "reconnectez Waselex" dans l'UI |
| 405 | Mauvaise méthode HTTP | Bug interne, ne devrait pas arriver |
| 422 | Validation échouée | Afficher errors[] à l'utilisateur |
| 500 | Erreur interne Waselex | Retry automatique raisonnable, sinon message "réessayez plus tard" |

---

## 3. Suivi des statuts — GET /orders/status (polling, PAS de webhook)

Waselex n'expose aucun webhook — suivre le même mécanisme déjà en place pour Vitipsexpress ([VITIPS-AUTO-SYNC] / [VITIPS-TRACK] dans les logs), avec un job périodique (15-30 minutes, comme recommandé par leur doc).

### Requêtes possibles
```
# Statut d'une commande précise
curl "https://waselex.ma/api/vendor/v1/orders/status?tracking_code=WSL-20260612143015XYZ4" -H "X-Api-Key: VOTRE_CLE_API"

# Plusieurs commandes à la fois (jusqu'à ~100 codes séparés par virgules)
curl "https://waselex.ma/api/vendor/v1/orders/status?tracking_code=WSL-CODE1,WSL-CODE2,WSL-CODE3" -H "X-Api-Key: VOTRE_CLE_API"

# Par plage de dates + statut
curl "https://waselex.ma/api/vendor/v1/orders/status?status=LIVRE&date_from=2026-06-01&date_to=2026-06-30" -H "X-Api-Key: VOTRE_CLE_API"
```
Paramètres disponibles : tracking_code, status, date_from, date_to, page (défaut 1), per_page (défaut 50, max 200).

### Réponse
```
{
  "success": true,
  "meta": { "total": 1, "page": 1, "per_page": 50, "total_pages": 1 },
  "orders": [{
    "tracking_code": "WSL-20260612143015XYZ4",
    "status": "MISE_EN_DISTRIBUTION",
    "status_label": "Mise en distribution",
    "client_name": "Ahmed Benali",
    "client_phone": "0612345678",
    "city": "Casablanca",
    "product_name": "Montre connectée X200",
    "quantity": 1,
    "price": 299.00,
    "delivery_fee": 25.00,
    "notes": "[Réf: CMD-1058] Appeler avant livraison",
    "created_at": "2026-06-12 14:30:15",
    "updated_at": "2026-06-13 09:12:44"
  }]
}
```
Stratégie de polling recommandée : interroger périodiquement avec date_from récent (ex: dernières 48h de commandes actives chez Waselex) pour limiter le volume, plutôt que de repasser tout l'historique à chaque fois — comme déjà fait pour Vitips.

### Mapping des statuts Waselex vers statuts internes de la plateforme

Écrire une fonction mapWaselexStatus(status: string): string | null, sur le modèle exact de mapVitipsStatus() (server/services/carrier-service.ts ~ligne 3039).

| Code Waselex | Statut interne |
|---|---|
| EN_ATTENTE_RAMASSAGE, EN_ATTENTE_PREPARATION, EN_PREPARATION, CONFIRME | confirme |
| MIS_EN_PROGRAMME, PROGRAMME, RAMASSE, RECU_PAR_LIVREUR | in_progress |
| EXPEDIER, PRET_POUR_DISTRIBUTION, EN_VOYAGE, MISE_EN_DISTRIBUTION, EN_COURS, EN_LIVRAISON, EN_COURS_DE_LIVRAISON | transit |
| LIVRE | delivered |
| REFUSE | refused |
| NO_RESPONSE, NO_RESPONSE_1_FOIS, NO_RESPONSE_2_FOIS, NO_RESPONSE_3_FOIS, NO_RESPONSE_JOUR_1, NO_RESPONSE_JOUR_2, NO_RESPONSE_JOUR_3, PAS_DE_REPONSE_JOUR_4, BOITE_VOCALE, NUMERO_ERRONE, INJOIGNABLE | unreachable |
| HORS_ZONE, FAUX_DESTINATION, CHANGEMENT_ADRESSE | unreachable (à confirmer avec moi si un statut plus spécifique existe déjà côté app) |
| REPORTE | confirme_reporte |
| PAS_INTERESSE, ANNULE, ANNULE_FACTURE, MANQUE_DE_STOCK, PAS_COMMANDER | cancelled |
| DEMANDE_DE_RETOUR, RETOUR, RETOUR_EN_PREPARATION, RETOUR_ENVOYE, RETOUR_PRET, RETOUR_RAMASSE, RETOUR_RECU_PAR_AGENCE, RETOUR_RECU_PAR_CLIENT, RETOUR_RECU_STOCK | returned |
| NON_RECU_PAR_LIVREUR | in_progress (retour au point de départ, pas encore livré) |
| CLIENT_INTERESSE, RELANCE, DEMANDE_DE_SUIVI, ECHANGE | à discuter avec moi — laisser en in_progress par défaut en attendant |

Ne rien deviner sur les lignes marquées "à discuter/confirmer" — les implémenter avec le mapping par défaut proposé, mais me les signaler clairement dans la réponse finale pour validation.

---

## 4. Villes (référentiel Waselex)

Waselex fournit une liste de 1480 villes, chacune avec un id numérique, sélectionnable via city_id (recommandé, plus fiable que le nom texte city).

- Créer une table waselex_cities avec la même structure que vitips_cities / ameex_cities déjà existantes (id externe, nom, éventuellement tarifs si disponibles).
- Créer un script de seed (server/seed-data/waselex-cities.ts, sur le modèle de server/seed-data/vitips-city-pricing.ts) pour importer la liste complète.
- Je fournirai le fichier Excel des villes Waselex séparément (lien "Excel villes" / "Excel villes + tarifs" mentionné dans leur doc) — utilise-le comme source pour ce script de seed plutôt que de retaper la liste à la main.
- Résolution ville vers city_id au moment de la création de commande : matcher le nom de ville de la commande (normalisé, insensible à la casse/accents) contre waselex_cities.name ; si aucun match fiable, fallback en envoyant city (texte) plutôt que city_id, plutôt que de bloquer la commande.

---

## 5. Interface utilisateur

1. Ajouter Waselex dans la liste des transporteurs disponibles (paramètres/intégrations), avec le logo fourni (waselex-logo.png).
2. Champ de saisie de la clé API (format wslx_...), avec bouton de test de connexion (ex: appeler /orders/status?per_page=1 pour valider que la clé fonctionne avant de sauvegarder).
3. Afficher le logo Waselex partout où les logos des autres transporteurs apparaissent déjà (Suivi des Colis, badge transporteur sur une commande, etc.) — même taille/format que les logos existants.

---

## Testing checklist
1. Créer une commande de test réelle → vérifier qu'elle apparaît côté Waselex avec le bon tracking_code stocké côté plateforme et le bon delivery_fee affiché.
2. Vérifier le rendu du logo Waselex dans l'UI (liste transporteurs + badge commande).
3. Forcer un test avec un téléphone mal formaté → vérifier qu'on reçoit bien l'erreur 422 et un message clair, sans commande créée.
4. Attendre (ou simuler) un changement de statut côté Waselex → vérifier que le polling le récupère et met à jour le bon statut interne dans les 30 minutes, sans intervention manuelle.
5. Vérifier la résolution d'au moins 5 villes différentes vers le bon city_id.
6. Confirmer avec moi la liste des statuts "à discuter" avant de considérer l'intégration terminée à 100%.
