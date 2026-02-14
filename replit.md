# replit.md

## Overview

This is an **FTTH ISP Ticketing & Maintenance Management System** — a full-stack web application designed for Internet Service Providers operating Fiber-to-the-Home networks. It manages three types of work orders: Home Maintenance (24h SLA), Backbone Maintenance (24h SLA), and New Installations (72h SLA).

The system enforces SLA deadlines automatically, prevents technician overload with a 4:2 maintenance-to-installation workload ratio, isolates backbone specialist teams, tracks technician performance, and provides a mobile-first UI for field teams alongside a full administrative dashboard.

**Key features:**
- Role-based access control (Superadmin, Admin, Helpdesk, Technician)
- Ticket lifecycle management (create, assign, start, close, delete)
- Automatic SLA enforcement with visual countdown timers
- Dashboard analytics with charts (recharts)
- Mobile-first technician view with bonus tracking
- Image uploads: speedtest screenshots, multiple proof images, description images, custom logo
- Bonus system: configurable per ticket type via Settings, auto-zero for overdue
- Reports: Tickets Report, Bonus Summary, Performance Summary (all with date filters)
- Settings page for bonus configuration and system preferences
- Session-based authentication with bcrypt password hashing

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight alternative to React Router)
- **State Management:** TanStack React Query for server state; no separate client state library
- **UI Components:** shadcn/ui (new-york style) built on Radix UI primitives
- **Styling:** Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Charts:** Recharts for dashboard analytics
- **Forms:** React Hook Form with Zod validation via @hookform/resolvers
- **Date handling:** date-fns
- **Icons:** Lucide React
- **Build tool:** Vite with HMR in development

The frontend lives in `client/src/`. Path aliases are configured: `@/` maps to `client/src/`, `@shared/` maps to `shared/`.

**Page structure:**
- `/login` — Login page
- `/dashboard/admin` — Admin dashboard with stats and charts
- `/dashboard/technician` — Mobile-first technician view
- `/tickets` — Ticket list with filters
- `/tickets/:id` — Ticket detail with assignment/close actions
- `/users` — User management (admin only)
- `/settings` — Bonus configuration and system settings (admin only)
- `/reports` — Tickets, Bonus, and Performance reports (admin only)

**Auth pattern:** The `useAuth` hook queries `/api/auth/me` to check session state. Auth state is cached in React Query. Protected routes redirect to `/login` if unauthenticated.

### Backend
- **Runtime:** Node.js with TypeScript (tsx for development, esbuild for production)
- **Framework:** Express.js
- **Session management:** express-session with MemoryStore (development) — should be switched to connect-pg-simple for production
- **Authentication:** Session-based auth with bcrypt password hashing; no JWT
- **File uploads:** Multer (memory storage) → S3-compatible object storage
- **API structure:** RESTful API under `/api/` prefix, defined in `shared/routes.ts` as a typed API contract

The server entry point is `server/index.ts`. Routes are registered in `server/routes.ts`. The storage layer is in `server/storage.ts` implementing an `IStorage` interface with a `DatabaseStorage` class.

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `shared/schema.ts` — Drizzle ORM table definitions and Zod insert schemas
- `shared/routes.ts` — API route definitions with Zod input/output schemas (typed API contract)

### Database
- **ORM:** Drizzle ORM with PostgreSQL dialect
- **Database:** PostgreSQL (required, connection via `DATABASE_URL` environment variable)
- **Schema push:** `npm run db:push` (uses drizzle-kit push)
- **Migrations directory:** `./migrations`

**Database tables:**
- `users` — User accounts with roles (superadmin, admin, helpdesk, technician), backbone specialist flag
- `tickets` — Work orders with type, priority, status, SLA deadline, customer info, location
- `ticketAssignments` — Maps tickets to assigned technicians
- `performanceLogs` — Tracks technician performance metrics

**Key enums (stored as text, validated in app):**
- UserRole: superadmin, admin, helpdesk, technician
- TicketType: home_maintenance, backbone_maintenance, installation
- TicketPriority: low, medium, high, critical
- TicketStatus: open, waiting_assignment, assigned, in_progress, closed, overdue

### Build & Deploy
- **Development:** `npm run dev` — runs tsx with Vite dev server middleware for HMR
- **Production build:** `npm run build` — Vite builds frontend to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Production start:** `npm start` — runs the bundled server which serves static files

The build script (`script/build.ts`) bundles specific server dependencies into the output to reduce cold start times, while keeping large native dependencies external.

## External Dependencies

### Database
- **PostgreSQL** — Primary data store, required. Connection string via `DATABASE_URL` environment variable.

### Object Storage
- **S3-compatible storage** — Used for proof image uploads (technician close-out photos). Configured via environment variables:
  - `S3_ENDPOINT` — S3-compatible endpoint URL
  - `S3_ACCESS_KEY_ID` — Access key
  - `S3_SECRET_ACCESS_KEY` — Secret key
  - Uses `forcePathStyle: true` for compatibility with non-AWS S3 providers

### Environment Variables Required
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Express session secret (falls back to "temp-secret" in dev)
- `S3_ENDPOINT` — S3 endpoint (optional, for file uploads)
- `S3_ACCESS_KEY_ID` — S3 access key (optional)
- `S3_SECRET_ACCESS_KEY` — S3 secret key (optional)

### Key NPM Packages
- **Server:** express, drizzle-orm, pg, bcryptjs, multer, @aws-sdk/client-s3, express-session, memorystore, connect-pg-simple
- **Client:** react, @tanstack/react-query, wouter, recharts, react-hook-form, zod, date-fns, framer-motion
- **Shared:** drizzle-zod, zod
- **UI:** Full shadcn/ui component library (Radix UI primitives + Tailwind CSS)