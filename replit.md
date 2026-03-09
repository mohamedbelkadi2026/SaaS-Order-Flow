# TajerGrow OMS - Order Management System

## Overview
TajerGrow (formerly Garean) is a SaaS Order Management System (OMS) for the Moroccan COD (Cash on Delivery) e-commerce market. Built with React+Vite frontend, Node.js/Express backend, and PostgreSQL database.

## Architecture
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui + Recharts + wouter routing
- **Backend**: Express 5 + Passport.js (session-based auth) + Drizzle ORM
- **Database**: PostgreSQL (Replit built-in)
- **Currency**: MAD (Moroccan Dirham), all prices stored in cents
- **Language**: French UI throughout

## Authentication
- Session-based auth using `express-session` + `connect-pg-simple`
- Passport.js with local strategy (email/password)
- Password hashing: Node.js `scrypt`
- Three roles: `owner` (admin/store owner), `agent` (confirmation staff), `superadmin` (isSuperAdmin flag)
- Multi-tenancy: each signup creates a new store + starter subscription. All data filtered by `storeId`

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

## Profitability Formula
`Profit = Selling Price - Cost Price - 40 MAD (4000 cents fixed shipping) - Ad Spend`
Only calculated for `delivered` orders (COD logic — profit counted only when money is collected).
ROI = (Net Profit / Ad Spend) × 100, ROAS = Revenue / Ad Spend

## Database Tables
- `stores` - Multi-tenant stores with ownerId, phone, website, facebook, instagram, logoUrl, canOpen, isStock, isRamassage, whatsappTemplate
- `users` - Auth users with roles (owner/agent), isSuperAdmin flag, password, payment config
- `products` - Store products with stock tracking, sellingPrice, description, imageUrl, hasVariants, createdAt
- `product_variants` - Product variants with name, sku, costPrice, sellingPrice, stock, imageUrl per variant
- `orders` - Orders with status workflow, costs, source tracking, shipping info
- `order_items` - Order line items linked to products
- `customers` - Auto-populated CRM from orders (name, phone, orderCount, totalSpent)
- `subscriptions` - Plan management (starter/pro, monthlyLimit, currentMonthOrders)
- `ad_spend_tracking` - Ad spend per product per day
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

## API Routes
### Auth
- `POST /api/auth/signup` - Create store + admin + starter subscription
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/user` - Current user (includes isSuperAdmin)

### Orders
- `GET /api/orders?status=X` - List orders (filter by status, agents see only their orders)
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

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
