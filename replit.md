# TajerGrow OMS - Order Management System + WhatsApp AI Automation

## Overview
TajerGrow is a SaaS Order Management System (OMS) designed for the Moroccan Cash on Delivery (COD) e-commerce market. It provides a comprehensive suite of tools including an AI Recovery System, Profit Analyzer Pro, and a Landing Page Builder. The platform's core purpose is to streamline order management, enhance sales recovery through AI-driven WhatsApp automation, and provide in-depth profitability analysis. It aims to empower e-commerce businesses in Morocco with advanced features for managing orders, inventory, customer relationships, and marketing campaigns, ultimately boosting efficiency and profitability.

## User Preferences
I want to interact with the system using clear and concise instructions. I prefer explanations that are straightforward and avoid overly technical jargon. My workflow preference is iterative, allowing for continuous adjustments and feedback. I expect the AI agent to prioritize order confirmation and recovery while providing real-time updates on its progress. I want to be asked before any major architectural changes or significant modifications to core functionalities.

## System Architecture
The TajerGrow OMS is built on a modern full-stack architecture:

-   **Frontend**: React 18 with Vite, styled using TailwindCSS and shadcn/ui for a clean, mobile-first UI/UX. Recharts is used for data visualization, and wouter handles client-side routing. The UI supports multi-language (FR/AR/EN) with RTL for Arabic.
-   **Backend**: Node.js with Express 5, employing Passport.js for session-based authentication and Drizzle ORM for database interaction.
-   **Database**: PostgreSQL, hosted on Replit's built-in service.
-   **Core Features**:
    -   **Multi-tenancy**: Each new signup creates a separate store with dedicated data isolation.
    -   **Authentication**: Session-based auth with `scrypt` hashing for passwords. Three roles: `owner`, `agent`, `superadmin`. Account suspension and paywall enforcement are integrated.
    -   **Order Management**: Supports manual creation, bulk import, and webhook integration for a 7-status COD workflow. Includes advanced tables with server-side filtering, pagination, and multi-item order handling. Stock auto-decrements on order confirmation.
    -   **LP Builder**: A 3-step wizard for creating mobile-first COD landing pages with AI-generated copy, customizable themes, and integrated order forms. Images are stored locally using Multer.
    -   **AI Automation Module**:
        -   **WhatsApp AI Confirmation**: GPT-4o powered AI agent for automated order confirmation in Darija, handling incoming messages, and supporting gender-aware prompts. It uses JSON-mode responses for robust decision-making.
        -   **WhatsApp Engine**: `@whiskeysockets/baileys` (pure Node.js WebSocket) for multi-tenant, multi-device WhatsApp integration. Sessions are persistent, and messages are sent via `whatsapp-service.ts` with Green API fallback. Includes real-time monitoring with SSE.
    -   **Shipping Integration**: Real carrier API integration (`carrier-service.ts`) for Moroccan carriers (Digylog, Cathedis, Ameex, etc.). Supports parallel batch shipping with SSE progress updates and includes robust city mapping to prevent "Ville invalide" errors.
    -   **Profitability**: Detailed net profit calculation for `delivered` orders, accounting for all costs (sourcing, shipping, packaging, commissions, ad spend) and providing ROI/ROAS metrics. All monetary values are stored in `centimes` in the DB.
    -   **Inventory Management**: Full CRUD for products with variant support. Features inventory stats, stock value summaries, and a new `stock_movements` ledger for accurate stock tracking and per-product insights.
    -   **Ad Spend Management**: Role-based module for media buyers to submit daily ad spend and for admins/owners to view consolidated spend across all buyers and sources.
    -   **User Interface**: Intuitive UI components, including a multi-filter dashboard, advanced orders table with customizable columns, mobile-friendly order cards, and professional modal designs for various forms (e.g., store management, order details).
    -   **Security**: Implements strong security measures including rate limiting, session fixation protection, strong password policies, input validation, and webhook hardening with token-based authentication.

## External Dependencies
-   **Database**: PostgreSQL
-   **AI/NLP**: OpenRouter/OpenAI (for AI copy generation and AI Confirmation agent)
-   **WhatsApp Integration**:
    -   `@whiskeysockets/baileys` (primary WhatsApp API)
    -   Green API (fallback for WhatsApp messaging)
-   **Carrier APIs**: Digylog, Eco-Track, Cathedis, Onessta, Speedex, Ameex, Sendit, Livo (specific Moroccan shipping carriers)
-   **E-commerce Platforms (Webhooks/Integrations)**:
    -   Shopify
    -   YouCan
    -   WooCommerce
    -   Google Sheets
    -   LightFunnels
    -   Magento
-   **Payment Gateway**: PayPal (for subscriptions)
-   **Subscription Management**: Polar.sh (for checkout URLs)
-   **Libraries/Frameworks**:
    -   React, Vite, TailwindCSS, shadcn/ui, Recharts, wouter (Frontend)
    -   Express, Passport.js, Drizzle ORM, multer, xlsx (Backend)
    -   `express-session`, `connect-pg-simple` (Session Management)
    -   Node.js `scrypt` (Password Hashing)
    -   `i18next` (Internationalization)
    -   `qrcode` (QR code generation for Baileys)
    -   `zod` (Schema validation)