# TajerGrow OMS - Order Management System + WhatsApp AI Automation

## Overview
TajerGrow is a SaaS Order Management System (OMS) for the Moroccan COD (Cash on Delivery) e-commerce market with AI Recovery System. Built with React+Vite frontend, Node.js/Express backend, and PostgreSQL database.

## Architecture
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui + Recharts + wouter routing
- **Backend**: Express 5 + Passport.js (session-based auth) + Drizzle ORM
- **Database**: PostgreSQL (Replit built-in)
- **Currency**: MAD (Moroccan Dirham), all prices stored in cents
- **Language**: Multi-language UI (FR/AR/EN) via i18next with RTL support for Arabic

## Smart Product Naming (Variant-Aware)
Products are displayed everywhere as **"Product Name - Variant"** (e.g., "Mocassins ANAKIO - 43") when a variant exists.
- **Data source**: `orderItems.variantInfo` (already populated from Shopify/YouCan webhooks via `sanitizeVariant()`); no new DB column needed
- **Orders table + card view** (`client/src/pages/orders.tsx`): reads `order.items[0].variantInfo` and appends ` - ${variant}` to the base product name
- **All-Orders table** (`client/src/pages/all-orders.tsx`): same logic
- **Analytics "Produits Commandés"** (`server/storage.ts` `getFilteredStats`): `allItems` query now includes `variantInfo`; product grouping key is `"Name - Variant"` instead of `"Name"`
- **Dashboard product performance table** (`server/routes.ts` `rawProductMap`): same variant-aware grouping
- **AI agent system prompt** (`server/ai-agent.ts` `buildStepPrompt`): `productLabel` is now `"Name - Variant"`
- **AI agent first greeting** (`server/ai-agent.ts` `initiateAIConversation`): greeting message uses combined `"Name - Variant"` label
- **WhatsApp campaign template `{Nom_Produit}`** (`server/routes.ts` `formatWhatsAppMessage`): substitution now includes variant
- **Invalid variants filtered**: strings `"Default Title"`, `"null"`, `"-"` are never shown

## Shipping Performance Optimization (Parallel Batching + SSE Progress)
The bulk ship endpoint now processes orders **in parallel batches of 5** (instead of one-by-one), targeting 50 orders in under 15 seconds.

- **10-second timeout per API call**: `AbortController` in `carrier-service.ts`; timeout errors return a clear message instead of hanging indefinitely.
- **`Promise.allSettled()` batching**: 5 carrier API calls fire simultaneously. Failed orders in a batch don't block the remaining ones.
- **Parallel DB writes**: After each batch resolves, `updateOrderShipping` + `updateOrderStatus` for all successful orders run in parallel via `Promise.all`, reducing DB round-trips.
- **SSE real-time progress**: After each batch the server broadcasts `shipping_progress` events (`{ done, total, shipped, failed }`) via `broadcastToStore`. A final broadcast includes `complete: true`.
- **Frontend progress modal** (`orders.tsx`):
  - Clicking the truck icon opens a progress modal immediately (not a toast) and hides the selection modal.
  - A local `EventSource` on `/api/automation/events` is opened while `active === true`.
  - The progress bar animates from `0% → 100%` as SSE events arrive, showing "Envoi des commandes en cours... X / Total".
  - On completion, the progress bar turns green (all success) or orange (partial failures) and shows ✅ N success / ❌ N failed cards.
  - The modal blocks interaction while active (can't accidentally close it), then shows a "Fermer" button when done.

## Real Carrier API Integration (`server/services/carrier-service.ts`)
The shipping dispatch routes now call actual carrier APIs — no more fake tracking numbers.

- **`server/services/carrier-service.ts`** — Central carrier HTTP service:
  - Endpoint registry for Digylog, Eco-Track, Cathedis, Onessta, Speedex, Ameex, Sendit, Livo, etc.
  - Builds the canonical Moroccan COD payload: `nom_complet`, `telephone`, `ville`, `adresse`, `prix` (centimes ÷ 100 → DH), `produit`, `ouverture_colis`, `reference`.
  - Auth headers: `Authorization: Bearer <apiKey>`, `X-API-KEY`, `Token`; optional `X-API-SECRET`.
  - Handles 4xx/5xx HTTP errors and logical 2xx errors (`{ success: false }`).
  - Extracts tracking number from many response key shapes (`barcode`, `tracking_number`, `code_suivi`, …).
  - Full console logging for every request/response for Railway debugging.
- **`POST /api/orders/:id/ship`** — Single ship: calls carrier API; only updates status to `Attente De Ramassage` on HTTP 200/201 success; returns `422` with carrier error message on failure.
- **`POST /api/orders/bulk-ship`** — Bulk ship: iterates eligible `confirme` orders, calls carrier per order, returns `{ shipped, failed, total, results }` so the UI can show partial-failure detail.
- **Frontend (`orders.tsx`)** — `handleBulkShip` now shows distinct toasts for all-success, partial, and all-failure cases; strips HTTP status prefix from error messages.
- **DB rule**: order status is updated to `Attente De Ramassage` **only** after the carrier confirms the shipment; failed orders remain `confirme`.

## City Mapping Feature (Carrier-Aware)
Prevents "Ville invalide" errors at shipping dispatch time.
- **`client/src/lib/carrier-cities.ts`** — City lists for Digylog, Cathedis, Amana + generic Morocco. `findBestCityMatch()` auto-matches raw city names (aliases, starts-with, contains). `isCityValid()` checks if a city is in the carrier list.
- **`client/src/components/city-combobox.tsx`** — Searchable dropdown; orange border + warning when city not found in carrier's list; allows free-text fallback.
- **`GET /api/carriers/cities`** — Returns city list for the primary active shipping integration. Reads `credentials.cityList` (stored), falls back to hardcoded carrier defaults.
- **`GET /api/carriers/cities/all`** — Returns all shipping integrations with their city lists (used by new-order form carrier selector).
- **`POST /api/carriers/refresh-cities`** — Tries to fetch cities from carrier API (Digylog/Cathedis endpoints), falls back to defaults, stores result in `credentials.cityList`.
- **Webhook auto-match** — On order arrival from Shopify/YouCan/token webhooks, city is automatically matched against the primary shipping carrier's city list before save. Logs `[CityMatch]` lines.
- **Order Details Modal** — City field replaced with `CityCombobox`; shows carrier name in label; orange warning when city unrecognized.
- **New Order Form** — City field replaced with `CityCombobox`; carrier selector appears when >1 shipping integration is active; city list updates per selected carrier.

## Authentication & Security
- Session-based auth using `express-session` + `connect-pg-simple`
- Passport.js with local strategy (email/password)
- Password hashing: Node.js `scrypt`
- Three roles: `owner` (admin/store owner), `agent` (confirmation staff), `superadmin` (isSuperAdmin flag)
- Multi-tenancy: each signup creates a new store + starter subscription. All data filtered by `storeId`
- **Account suspension**: `requireAuth` returns 403 `{suspended:true}` for inactive (`isActive=0`) non-super-admins; frontend auto-logs out and shows banner
- **Paywall system**: `requireActiveSubscription` middleware returns 402 `{paywall:true,reason}` for blocked stores; frontend shows full-screen overlay

## Paywall / Subscription Enforcement
- `storage.checkPaywall(storeId)` checks: (1) `planExpiryDate < now` → `isExpired`, (2) `currentMonthOrders >= effectiveLimit` (where limit=0 means unlimited) → `isLimitReached`
- `requireActiveSubscription` middleware in `auth.ts` — applied to all order write routes
- Two overlay scenarios in `app-layout.tsx`: **Expired** (CalendarX icon, red message) vs **Limit** (Rocket icon, gold with plan selector)
- Super admins (`isSuperAdmin=1`) bypass both suspension and paywall checks always
- `useSubscription` polls every 30s so paywall lifts within 30s of super admin plan update
- Protected write routes: `POST /api/orders`, `/api/orders/manual`, `/api/orders/import`, `/api/orders/bulk-ship`, `/api/orders/:id/ship`
- Webhook handlers also check paywall before accepting orders

## Order Status System (7 COD Statuses)
- `nouveau` (default) — New order
- `confirme` — Confirmed by agent
- `Injoignable` — Customer unreachable
- `Annulé (fake)` — Cancelled as fake order
- `Annulé (faux numéro)` — Cancelled due to wrong number
- `Annulé (double)` — Cancelled as duplicate
- `boite vocale` — Voicemail / no answer
- Legacy delivery statuses: `in_progress`, `delivered`, `refused`

Stock auto-decrements when status changes to `confirme`, restores when changed away from it.

## Profitability Formula (COD Net Profit)
`Net Profit = Revenue - Sourcing Cost - Shipping Cost - Packaging Cost - Agent Commissions - Ad Spend`
Only calculated for `delivered` orders (COD logic — profit counted only when money is collected).
ROI = (Net Profit / Ad Spend) × 100, ROAS = Revenue / Ad Spend

### Currency Unit Conventions (CRITICAL)
- `revenue`, `productCost`, `shippingCost`, `packagingCost` → **centimes** (DB integers, divide by 100 to display)
- `commissionRate` (store_agent_settings) → **DH** (e.g., 5 = 5 DH/order); formula uses `rate * 100` to convert to centimes
- `adSpendTracking.amount` (legacy table) → **DH** (multiply by 100 when reading for P&L calculations)
- `adSpend.amount` (new marketing-spend table) → **centimes** (route converts DH input → centimes on write)
- `formatCurrency()` always expects centimes input → displays as MAD
- All profit functions: `getAdminProfitSummary`, `getMediaBuyerProfit`, `getTeamProfitSummary` centrally apply `* 100` to legacy adSpend

## Database Tables
- `stores` - Multi-tenant stores with ownerId, phone, website, facebook, instagram, logoUrl, canOpen, isStock, isRamassage, whatsappTemplate
- `users` - Auth users with roles (owner/agent), isSuperAdmin flag, password, payment config
- `products` - Store products with stock tracking, sellingPrice, description, imageUrl, hasVariants, createdAt
- `product_variants` - Product variants with name, sku, costPrice, sellingPrice, stock, imageUrl per variant
- `orders` - Orders with status workflow, costs, source tracking, shipping info
- `order_items` - Order line items linked to products
- `customers` - Auto-populated CRM from orders (name, phone, orderCount, totalSpent)
- `subscriptions` - Plan management (starter/pro/trial, monthlyLimit, currentMonthOrders, isBlocked, planStartDate, planExpiryDate)
- `ad_spend_tracking` - Ad spend per product per day per source (fields: storeId, mediaBuyerId, productId, date, amount, source, notes)
- `store_integrations` - Integration credentials (provider, type, JSON credentials, isActive)
- `integration_logs` - Log entries for all integration activities
- `agent_products` - Agent-product assignment for targeted order routing
- `sessions` - Express session storage

## Key Features
1. **Auth**: Signup/Login with multi-tenancy, auto-creates starter subscription
2. **Order Management**: Manual order creation + webhook import with 7-status COD workflow
3. **Mobile Card View**: Touch-friendly order cards on mobile with Phone (tel:) and WhatsApp (wa.me) links per order
4. **Stock Logic**: Auto-decrease stock when order set to 'confirme', restore when changed away
5. **Agent Management**: Create/delete agents, real performance tracking (confirmation/delivery rates)
6. **Agent Product Assignment**: Assign specific products to agents; only matching orders routed to them
7. **Round-Robin Auto-Assignment**: New orders (webhook and manual) auto-assigned to agents via round-robin with product filtering
8. **Client List (CRM)**: Auto-populated from orders, searchable customer table
9. **Subscription/Billing**: Starter (200 DH/1500 orders) and Pro (400 DH/unlimited) plans with enforcement
10. **Super Admin Panel**: Global stats, all stores list, toggle store activation
11. **Store Integrations**: Shopify, YouCan, WooCommerce, Google Sheets, LightFunnels, Magento
12. **Shipping Integrations**: Moroccan carriers (Cathedis, Digylog, Onessta, etc.)
13. **Send to Delivery**: Ship button in order modal with tracking
14. **Integration Logs**: Full audit trail
15. **WooCommerce Background Sync**: Polls every 10 minutes
16. **Inventory**: Full CRUD for products with variant support. Stats dashboard (total products, quantity, low stock, out of stock, new this month). Advanced table with Reçu/Sortie/Disponible/Conf%/Livr% analytics per product. Product creation form with variant toggle (name/sku/cost/selling/stock per variant). Stock value summaries (coûtant, vente, marge potentielle). API: `GET /api/products/inventory`
17. **Multi-Filter Dashboard**: Horizontal filter bar with city, product, agent, source, shipping provider, and date preset filters. All stat cards, charts, pie charts, team performance, and top products update in real-time when any filter changes. Product performance drill-down with confirmation/delivery rates and per-product ROI. Date presets: Today, Yesterday, This Month, Last Month, Custom range.
18. **Profitability**: Delivered-only profit calculation with ROI/ROAS metrics, ad spend tracking, 40 MAD fixed shipping. Dynamic: Net Profit = Revenue(Livré) - COGS - Shipping(40 MAD) - Ad Spend
19. **Multi-Store CRUD**: Professional two-column modal matching SaaS UI design. Left column: Logo placeholder (150x150), toggles (Peut ouvrir, Stock, Ramassage), live WhatsApp chat preview. Right column: Business info (Nom, Téléphone, Site web, Facebook, Instagram), Team section (agents display), Delivery config (carriers + platforms display), WhatsApp message template editor with clickable variable tags ({Nom_Client}, {Ville_Client}, {Address_Client}, {Phone_Client}, {Date_Commande}, {Heure}, {Nom_Produit}, {Transporteur}, {Date_Livraison}). Variable substitution in order WhatsApp links (wa.me). Store cards with badges (Peut ouvrir, Ramassage, WhatsApp)
20. **Advanced Orders Table**: Server-side filtered/paginated table with 15 toggleable columns. Column visibility controller (Colonnes dropdown) with localStorage persistence. Inline per-column search filters (Code, Destinataire, Téléphone, Ville, Produit, Action By). Color-coded action bar (Assign/Delete/Ship/Export/Columns). Bulk assign modal (service type + agent), bulk ship modal. Responsive mobile cards. Source filter in filter bar.
21. **Commandes (Toutes)**: Central hub page showing ALL orders regardless of status. Full feature parity with Mes Commandes: same advanced table, column visibility, inline filters, bulk actions, mobile card view. Status filter dropdown, agent filter, source filter, date range. Bulk ship warns when non-confirmed orders selected. Route: `/orders/all`, API: `GET /api/orders/all`.
22. **Order Details Modal** (`client/src/components/order-details-modal.tsx`): Full redesign matching exact SaaS screenshot. Header with store name + track number. 4 pill-toggle switches (replace/canOpen/upSell/isStock). Two-column form: left (replacement track, name, phone, address, Ville dropdown with 40+ Moroccan cities + carrier logo, statut select, commentStatus), right (rawProductName auto-filled from webhook, prix, reference, commentOrder, détails textarea showing quantity/order_number/variant). Order Items section with +/delete, each item row shows rawProductName, SKU badge, price DH input, variant info, qty input. Save calls PATCH /api/orders/:id with all new fields.
23. **Raw Product Name**: New `raw_product_name` column on orders and order_items tables. Webhook handlers capture `line_items[0].title` as rawProductName on order creation. Order items also store `raw_product_name`, `variant_info`, `sku` individually. Display priority: raw name from store beats internal SKU name. New API: POST /api/orders/:id/items, PATCH /api/order-items/:id, DELETE /api/order-items/:id.
25. **Ad Spend Management (Publicités)**: Role-based ad spend module at `/publicites`. Media buyers: form to submit daily ad spend (date, source, product, amount in DH) + history table. Admins/owners: master view of all ad spend across all media buyers, per-buyer badges, per-source breakdown cards (Facebook/TikTok/Google/Snapchat with distinct colors), per-product totals. Sources: `Facebook Ads`, `TikTok Ads`, `Google Ads`, `Snapchat Ads`. Uniqueness constraint: storeId+mediaBuyerId+date+productId+source (upsert). Gold `#C5A059` accent for save button and dashboard Total Dépenses Pub card.
26. **Nouvelle Commande (New Order Flow)**: Two-page order creation flow under sidebar submenu "Nouvelle commande" → Ajouter / Importer. `new-order-add.tsx` (`/orders/add`): full manual form with Moroccan city dropdown, toggles (canOpen/isStock/replace), agent assignment, product line items with rawProductName, auto-total calculation; posts to `POST /api/orders/manual`. `new-order-import.tsx` (`/orders/import`): 3-step drag-and-drop Excel/CSV import (upload → column mapping → results); posts to `POST /api/orders/import` with multer + xlsx parsing. Nav sidebar updated with `isNouvelleMenu` submenu rendering matching the Intégrations pattern.

## API Routes
### Auth
- `POST /api/auth/signup` - Create store + admin + starter subscription
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/user` - Current user (includes isSuperAdmin)

### Orders
- `GET /api/orders?status=X` - List orders (filter by status, agents see only their orders)
- `POST /api/orders/manual` - Create manual order from new-order-add.tsx form (supports rawProductName items, toggles, agentId)
- `POST /api/orders/import` - Bulk import orders from Excel/CSV with column mapping (multer + xlsx)
- `POST /api/orders` - Create manual order (checks subscription limit, auto-assigns agent via round-robin)
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id` - Update order fields
- `PATCH /api/orders/:id/status` - Update order status
- `PATCH /api/orders/:id/assign` - Assign agent
- `POST /api/orders/:id/ship` - Send to delivery carrier
- `GET /api/orders/filtered?status=X&agentId=X&city=X&source=X&dateFrom=X&dateTo=X&search=X&page=X&limit=X` - Server-side filtered/paginated orders
- `GET /api/orders/all?status=X&agentId=X&city=X&source=X&dateFrom=X&dateTo=X&search=X&page=X&limit=X` - All orders (no required status), same filters
- `POST /api/orders/bulk-assign` - Bulk assign orders to agent (owner/admin only, validates agent store)
- `POST /api/orders/bulk-ship` - Bulk ship confirmed orders (owner/admin only, validates shipping integration)

### Stats
- `GET /api/stats` - Dashboard stats (all status counts, revenue from confirme+delivered, profit from delivered only)
- `GET /api/stats/daily` - Daily order counts for last 30 days (line chart)
- `GET /api/stats/top-products` - Top 10 products by revenue (from confirme/delivered orders)
- `GET /api/stats/filter-options` - Distinct filter values (cities, sources, agents, products, shippingProviders)
- `GET /api/stats/filtered?city=X&productId=X&agentId=X&source=X&shippingProvider=X&dateFrom=X&dateTo=X` - Filtered analytics with all stats, daily chart, top products, ROI/ROAS

### Products
- `GET /api/products` - List products
- `GET /api/products/inventory` - Inventory stats with product performance analytics
- `POST /api/products` - Create product (supports variants array)
- `PATCH /api/products/:id` - Update product (name, sku, stock, costPrice, sellingPrice, description, imageUrl, reference)
- `DELETE /api/products/:id` - Delete product (cascades to variants)

### Team
- `GET /api/agents` - List team members
- `POST /api/agents` - Create agent
- `DELETE /api/agents/:id` - Delete agent
- `GET /api/agents/performance` - Agent performance stats
- `GET /api/agents/:id/products` - Get agent's assigned products
- `PUT /api/agents/:id/products` - Set agent's product assignments

### Stores (Magasins)
- `GET /api/magasins` - List owner's stores
- `POST /api/magasins` - Create new store (sets ownerId)
- `PATCH /api/magasins/:id` - Update store
- `DELETE /api/magasins/:id` - Delete store (cannot delete current store)

### CRM & Billing
- `GET /api/customers` - List customers
- `GET /api/subscription` - Get subscription + usage
- `POST /api/subscription` - Choose/switch plan

### Integrations
- `GET /api/integrations?type=X` - List integrations
- `POST /api/integrations` - Connect integration
- `PATCH /api/integrations/:id` - Update credentials
- `DELETE /api/integrations/:id` - Disconnect
- `GET /api/integration-logs` - Integration logs
- `POST /api/integrations/webhook/:provider?store_id=X` - Unified webhook (no auth, auto-assigns via round-robin)

### Super Admin
- `GET /api/admin/stores` - List all stores
- `GET /api/admin/stats` - Global SaaS stats
- `PATCH /api/admin/stores/:id/toggle` - Activate/deactivate store

## Frontend Pages
- `/auth` - Auth page (login/register)
- `/` - Dashboard
- `/orders` - Orders list (mobile card view + desktop table)
- `/orders/new` - New order form
- `/orders/:filter` - Filtered orders (confirme, injoignable, annules, boite-vocale, en-cours, livrees, refuses)
- `/inventory` - Stock management (CRUD)
- `/team` - Team with performance tracking + product assignment dialog
- `/clients` - Customer CRM list
- `/magasins` - Store management (CRUD)
- `/billing` - Subscription & plan management
- `/invoices` - Invoices
- `/profitability` - Profitability with ROI/ROAS, ad spend, delivered-only calculation
- `/integrations` - Store integrations
- `/integrations/shipping` - Shipping carriers
- `/integrations/logs` - Integration logs
- `/admin` - Super admin panel (conditional)
- `/media-buyers` - Media buyer management (admin)
- `/publicites` - Ad spend management (role-based: media buyers submit, admins view all)
- `/mes-depenses` - Legacy ad spend route (backward compat)

## Marketing & AI Automation Module (`/automation`)
Four tabs in `client/src/pages/automation.tsx`:
1. **Retargeting** — Campaign management for inactive clients
2. **IA Confirmation** — GPT-4o Darija AI settings, system prompt editor, product selection, enabled toggle
3. **Connexion WhatsApp** — Baileys (direct QR scan, no browser needed), 4 states: idle/connecting/qr/connected. Session persists in `auth_info_baileys/`
4. **Live Monitoring** — Real-time conversation dashboard with SSE; left panel = conversation list, right panel = live chat + takeover controls

### AI Engine (`server/ai-agent.ts`)
- **Order Confirmation only** — Lead/Ventes Directes fully removed. AI only handles customers with an existing order.
- `triggerAIForNewOrder(storeId, orderId, phone, name, productId)` — fire-and-forget, checks settings enabled + product filter
- `handleIncomingMessage(storeId, phone, text)` — intent fast-path (CONFIRM/CANCEL keywords) → JSON-mode AI step machine
- **JSON-mode responses**: every AI call uses `JSON_OUTPUT_RULE` mandating `{"reply":"...","is_confirmed":bool,"is_cancelled":bool}` output; `parseAIDecision()` extracts structured decisions robustly (with regex fallback)
- **Gender-aware prompts**: `detectGender(name)` → `getGenderAddress()` → injects `سيدي`/`لالة` into every step prompt as a MANDATORY label
- **5-second human typing delay**: AI reply is broadcast to the admin dashboard immediately; WhatsApp delivery waits 5s (both fast-path and AI-path) to simulate a real person typing
- `buildStepPrompt(step, order, product, gender)` — multi-step Darija confirmation conversation
- `RECOVERY_SYSTEM_PROMPT` — recovery (abandoned cart) prompt also enforces JSON output
- Hooked into `POST /api/orders`, `POST /api/orders/manual`, and Shopify/YouCan webhooks after response sent

### WhatsApp Engine (`server/baileys-service.ts`) — Multi-Tenant + Multi-Device
- `@whiskeysockets/baileys` — pure Node.js WebSocket, no Chromium required
- **Primary store session**: `getBaileysInstance(storeId)` factory — one session per store
  - Auth folder: `./auth_info/store_<storeId>/`
  - SSE broadcasts: `broadcastToStore(storeId, "wa_status", ...)`
- **Multi-device sessions**: `getDeviceInstance(deviceId, storeId)` factory — one per `whatsapp_devices` row
  - Auth folder: `./auth_info/store_<storeId>/device_<deviceId>/`
  - SSE broadcasts: `broadcastToStore(storeId, "wa_device_status", { deviceId, state, phone, qr })`
  - Heartbeat timer: if stuck in "connecting" for 90 s, auto-restarts
- **Shared version cache** (`getCachedVersion()`): Baileys version fetched once from WhatsApp servers, reused by all sessions — prevents hang when adding 2nd/3rd device
- **Connection semaphore** (`withConnectLock()`): serialises socket initialisation so multiple devices don't race to connect simultaneously
- **pino logger** at `"error"` level — minimal noise, no CPU waste
- 4 states per session: `idle` | `connecting` | `qr` | `connected`
- QR: Navy/white base64 PNG via `qrcode` package
- Auto-reconnects on loss; heartbeat detects dead sockets; 90 s timeout restarts hung connections
- `autoStartBaileys()` on boot: migrates legacy `auth_info_baileys/` → `auth_info/store_1/`, auto-starts stores with existing sessions; `autoStartDevices()` auto-starts devices with saved credentials
- `baileysService` export kept as backward-compat shim (delegates to `getBaileysInstance(1)`)

### WhatsApp Transport (`server/whatsapp-service.ts`) — Multi-Tenant
- `sendWhatsAppMessage(phone, message, storeId?)` — uses `getBaileysInstance(storeId)`; fallback: Green API
- `sendWhatsAppImage(phone, imageUrl, caption, storeId?)` — per-store image delivery
- Per-store retry queues (`Map<storeId, PendingMessage[]>`): Store A failures don't affect Store B
- `flushPendingQueue(storeId)` called by Baileys on connect to drain queued messages
- Moroccan 0XXXXXXXXX → 212XXXXXXXXX conversion handled in both paths

### SSE (`server/sse.ts`)
- `addSSEClient(storeId, res)` — subscribe per store
- `broadcastToStore(storeId, event, data)` — push events to all store clients
- Events: `new_conversation`, `message`, `confirmed`, `cancelled`, `takeover`, `ai_error`

### AI Conversations Table (`aiConversations`)
- Tracks state: `active` | `confirmed` | `cancelled` | `manual`
- `isManual` flag = admin takeover (AI stops responding)
- `whatsappJid` column = actual WhatsApp JID stored on first message for exact future routing (prevents conversation mixing between customers)
- 9 storage methods in storage.ts: `getActiveAiConversationByPhone`, `getActiveAiConversationByJid`, `updateConversationJid`, etc.

### Message Routing Priority (Baileys)
1. **JID match** — `getActiveAiConversationByJid(rawJid)` — most reliable, stored on first message
2. **Phone match** — normalized formats (+212/0X/raw), stores JID on match for future Step 1
3. **Unknown number** — always → Sales Closer lead flow (old LID→ORDER fallback removed to prevent mixing bug)

### Automation Routes
- `GET /api/automation/events` — SSE stream
- `GET /api/automation/conversations` — list active conversations
- `GET /api/automation/conversations/:id/messages` — message history
- `POST /api/automation/conversations/:id/takeover` — toggle manual/AI mode
- `POST /api/automation/conversations/:id/send` — admin sends message
- `POST /api/webhooks/whatsapp-incoming` — incoming webhook (Green API fallback)
- `GET /api/automation/whatsapp/status` — Baileys state: { state, phone, qr }
- `POST /api/automation/whatsapp/connect` — start Baileys connection
- `POST /api/automation/whatsapp/disconnect` — logout + clear session files
- `POST /api/automation/whatsapp/send-test` — send test WhatsApp message
- `POST /api/automation/conversations/trigger/:orderId` — manually trigger AI

### Setup Required
1. Set `OPENROUTER_API_KEY` secret (or `OPENAI_API_KEY`) for AI confirmation flow
2. In the Automation → WhatsApp tab: click "Générer QR Code", scan with WhatsApp on your phone
3. Session is saved automatically — no rescan needed after server restart
4. (Optional) Set `GREENAPI_INSTANCE_ID` + `GREENAPI_API_TOKEN` as Green API fallback transport

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `OPENAI_API_KEY` - GPT-4o for AI confirmation agent
- `GREENAPI_INSTANCE_ID` - Green API WhatsApp instance
- `GREENAPI_API_TOKEN` - Green API authentication token
- `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` / `VITE_PAYPAL_CLIENT_ID` - PayPal payments
- `VITE_POLAR_CHECKOUT_URL_STARTER` / `VITE_POLAR_CHECKOUT_URL_PRO` - Polar.sh checkout URLs
