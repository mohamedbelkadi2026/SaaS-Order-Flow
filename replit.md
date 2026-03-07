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
- Three roles: `owner` (admin/store owner), `agent` (confirmation staff), `superadmin` (isSuperAdmin flag)
- Multi-tenancy: each signup creates a new store + starter subscription. All data filtered by `storeId`

## Database Tables
- `stores` - Multi-tenant stores
- `users` - Auth users with roles (owner/agent), isSuperAdmin flag, password, payment config
- `products` - Store products with stock tracking
- `orders` - Orders with status workflow, costs, source tracking, shipping info
- `order_items` - Order line items linked to products
- `customers` - Auto-populated CRM from orders (name, phone, orderCount, totalSpent)
- `subscriptions` - Plan management (starter/pro, monthlyLimit, currentMonthOrders)
- `ad_spend_tracking` - Ad spend per product per day
- `store_integrations` - Integration credentials (provider, type, JSON credentials, isActive)
- `integration_logs` - Log entries for all integration activities
- `sessions` - Express session storage

## Key Features
1. **Auth**: Signup/Login with multi-tenancy, auto-creates starter subscription
2. **Order Management**: Manual order creation + webhook import with status workflow
3. **Stock Logic**: Auto-decrease stock when order confirmed, restore when un-confirmed
4. **Agent Management**: Create/delete agents, real performance tracking (confirmation/delivery rates)
5. **Client List (CRM)**: Auto-populated from orders, searchable customer table
6. **Subscription/Billing**: Starter (200 DH/1500 orders) and Pro (400 DH/unlimited) plans with enforcement
7. **Super Admin Panel**: Global stats, all stores list, toggle store activation
8. **Store Integrations**: Shopify, YouCan, WooCommerce, Google Sheets, LightFunnels, Magento
9. **Shipping Integrations**: Moroccan carriers (Cathedis, Digylog, Onessta, etc.)
10. **Send to Delivery**: Ship button in order modal with tracking
11. **Integration Logs**: Full audit trail
12. **WooCommerce Background Sync**: Polls every 10 minutes
13. **Inventory**: Full CRUD for products (create/edit/delete)
14. **Dashboard**: Real-time stats
15. **Profitability**: Revenue/cost/profit breakdown with ad spend tracking

## API Routes
### Auth
- `POST /api/auth/signup` - Create store + admin + starter subscription
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/user` - Current user (includes isSuperAdmin)

### Orders
- `GET /api/orders?status=X` - List orders
- `POST /api/orders` - Create manual order (checks subscription limit, auto-creates customer)
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id` - Update order fields
- `PATCH /api/orders/:id/status` - Update order status
- `PATCH /api/orders/:id/assign` - Assign agent
- `POST /api/orders/:id/ship` - Send to delivery carrier

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `PATCH /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Team
- `GET /api/agents` - List team members
- `POST /api/agents` - Create agent
- `DELETE /api/agents/:id` - Delete agent
- `GET /api/agents/performance` - Agent performance stats

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
- `POST /api/integrations/webhook/:provider?store_id=X` - Unified webhook (no auth)

### Super Admin
- `GET /api/admin/stores` - List all stores
- `GET /api/admin/stats` - Global SaaS stats
- `PATCH /api/admin/stores/:id/toggle` - Activate/deactivate store

## Frontend Pages
- `/` - Auth page or Dashboard
- `/orders` - Orders list
- `/orders/new` - New order form
- `/orders/:filter` - Filtered orders
- `/inventory` - Stock management (CRUD)
- `/team` - Team with performance tracking
- `/clients` - Customer CRM list
- `/magasins` - Store management
- `/billing` - Subscription & plan management
- `/invoices` - Invoices
- `/profitability` - Profitability with ad spend
- `/integrations` - Store integrations
- `/integrations/shipping` - Shipping carriers
- `/integrations/logs` - Integration logs
- `/admin` - Super admin panel (conditional)

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `SHOPIFY_WEBHOOK_SECRET` (optional) - Legacy Shopify webhook HMAC secret
