# Livcash

Official API contract: https://clients.livcash.ma/api.html (reviewed 2026-11-02).

In Intégrations → Sociétés de livraison, connect Livcash with the merchant's API token. The endpoint is fixed to `https://clients.livcash.ma/api-parcels`; the token is sent in multipart form data. No custom host or webhook setup is required.

Sending one SaaS order creates one parcel (`qty=1`). Product quantities appear in its note; the COD price is the order total converted from centimes to DH. The submitted reference `TG{storeId}-{orderId}` is stable across attempts. A returned SKU is saved as the tracking reference. There is no automatic creation retry, including timeouts and duplicate reference responses: verify the parcel in Livcash before retrying an ambiguous request.

The documented API accepts city names. Optionally import the merchant's supported city names with Importer villes, for example `["Casablanca", "Agadir"]`. There is no documented city-list endpoint. Livcash validates the city during creation. Carrier warehouse stock mode is not supported by this contract.

Status polling runs every 15 minutes (50 parcels per active account per pass, persisted cursor). A manual status sync is also available. Polling is scoped to the merchant and carrier account; an unassigned legacy parcel is eligible only with one active account. It never creates a shipment. No unauthenticated Livcash webhook updates are accepted.

The public documentation does not include a tracking response example or status enumeration. The parser accepts string statuses in standard parcel containers, ignores boolean acknowledgements, matches parcel references when present, and maps only explicit French/English lifecycle labels. Unknown labels are preserved in `commentStatus` without changing the order's lifecycle. Verify the response format and status labels against the first real parcel after entering a valid token; no live-token test was possible during implementation. No delivery tariff, label endpoint, warehouse stock API or can-open field is inferred.

Validation: `node --test scripts/test-livcash.mjs`, `npm run check`, `npm run build`. The tests mock the carrier network and exercise SQL account isolation/cursor rotation with PGlite.
