# Garean OMS - Order Management System

## Overview
Garean is a SaaS Order Management System (OMS) for Moroccan e-commerce store owners. Built with React+Vite frontend, Node.js/Express backend, and PostgreSQL database.

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
- Two roles: `owner` (admin/store owner) and `agent` (confirmation staff)
- Multi-tenancy: each signup creates a new store. All data filtered by `storeId`

## Database Tables
- `stores` - Multi-tenant stores
- `users` - Auth users with roles (owner/agent), password, payment config
- `products` - Store products with stock tracking
- `orders` - Orders with status workflow, costs, source tracking, shipping info (trackNumber, labelLink, shippingProvider)
- `order_items` - Order line items linked to products
- `ad_spend_tracking` - Ad spend per product per day
- `store_integrations` - Integration credentials (provider, type, JSON credentials, isActive)
- `integration_logs` - Log entries for all integration activities (webhooks, syncs, shipping)
- `sessions` - Express session storage

## Key Features
1. **Auth**: Signup/Login with multi-tenancy
2. **Order Management**: CRUD with status workflow (new -> confirmed -> in_progress -> delivered)
3. **Stock Logic**: Auto-decrease stock when order confirmed, restore when un-confirmed
4. **Agent Management**: Admin creates agents, agents see only assigned orders
5. **Store Integrations**: Connect Shopify, YouCan (webhooks), WooCommerce (REST API polling every 10 min), Google Sheets, LightFunnels, Magento
6. **Unified Webhook**: POST /api/integrations/webhook/:provider?store_id=X — verifies HMAC for Shopify/YouCan, maps payload to orders, logs success/fail
7. **Shipping Integrations**: Connect Moroccan carriers (Cathedis, Digylog, Onessta, etc.) with API keys
8. **Send to Delivery**: Button in order modal sends to carrier API, saves tracking number + label link
9. **Integration Logs**: Full audit trail of all webhook/sync/shipping attempts with success/fail status
10. **WooCommerce Background Sync**: server/jobs/woocommerce-sync.ts polls every 10 minutes
11. **Ad Spend Tracking**: Save spend per product per day
12. **Dashboard**: Real-time stats from database
13. **Profitability**: Revenue/cost/profit breakdown per order

## API Routes (all require auth except webhook)
- `POST /api/auth/signup` - Create store + admin
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/user` - Current user
- `GET /api/stats` - Dashboard stats
- `GET /api/orders?status=X` - List orders (filtered by store)
- `PATCH /api/orders/:id/status` - Update order status
- `PATCH /api/orders/:id/assign` - Assign agent
- `POST /api/orders/:id/ship` - Send order to shipping carrier
- `GET /api/products` - List products
- `GET /api/agents` - List team members
- `POST /api/agents` - Create agent (admin only)
- `GET /api/ad-spend` - List ad spend entries
- `POST /api/ad-spend` - Save ad spend entry
- `GET /api/integrations?type=X` - List store integrations
- `POST /api/integrations` - Connect integration (create/update)
- `PATCH /api/integrations/:id` - Update integration credentials
- `DELETE /api/integrations/:id` - Disconnect integration
- `GET /api/integration-logs` - Get integration logs
- `POST /api/integrations/webhook/:provider?store_id=X` - Unified webhook (no auth)
- `POST /api/webhooks/shopify?store_id=X` - Legacy Shopify webhook (no auth)

## Frontend Pages
- `/` - Auth page (login/signup) when not logged in
- `/` - Dashboard (when logged in)
- `/orders` - Orders list (new by default)
- `/orders/:filter` - Filtered orders (confirmation, annules, suivies, livrees)
- `/inventory` - Stock management
- `/team` - Team management with "Ajouter un membre" modal
- `/magasins` - Store management
- `/invoices` - Invoices
- `/profitability` - Advanced profitability with ad spend tracking
- `/integrations` - Store integrations (connect Shopify, WooCommerce, YouCan, etc.)
- `/integrations/shipping` - Shipping provider integrations (connect Moroccan carriers)
- `/integrations/logs` - Integration activity logs

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `SHOPIFY_WEBHOOK_SECRET` (optional) - Legacy Shopify webhook HMAC secret
