# PharmTrack 💊

**Real-time medicine availability network for Zimbabwe**

PharmTrack connects patients to pharmacies by showing which nearby pharmacy has the medicine they need in stock — live. Pharmacies manage their inventory, receive SMS low-stock alerts, and gain analytics on what patients are searching for. Administrators oversee the entire network with full user management, drug database control, and analytics.

---

## 🎯 Problem Statement

In Zimbabwe, patients often visit multiple pharmacies before finding the medicine they need. PharmTrack solves this by providing a centralized, real-time search engine for pharmacy stock across Harare, Mutare, Bulawayo, and Gweru.

---

## 🔑 Demo Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | `admin@pharmtrack.co.zw` | `admin1234` | Full admin dashboard (`/admin`) |
| **Pharmacy** | `demo@pharmtrack.co.zw` | `demo1234` | Pharmacy dashboard (`/dashboard`) |

> These demo accounts bypass backend auth and work out of the box for testing.

---

## ✨ Features

### For Patients (No Login Required)
- **Drug Search** — Autocomplete search across 20+ common medicines by generic name, brand name, or local term
- **Pharmacy Results** — See which pharmacies have your drug in stock, sorted by availability, distance, or price
- **Real-time Status** — IN STOCK / LOW STOCK / OUT OF STOCK indicators with quantity and pricing
- **City Filtering** — Filter by Harare, Bulawayo, Mutare, Gweru or use GPS geolocation
- **Click-to-Call** — One-tap phone dialling to the pharmacy

### For Pharmacies (Dashboard — `/dashboard`)
- **Stock Management** — Full CRUD: Add, edit, and remove drugs from inventory
- **Import / Export** — Bulk import stock from CSV or Excel (.xlsx); export current inventory to CSV or Excel
- **Alert Settings** — Configure SMS alerts for low stock, set per-drug thresholds, choose frequency (daily/weekly)
- **Subscription Plans** — Free ($0), Basic ($29/mo), Pro ($79/mo) tiers with increasing capabilities
- **Pharmacy Profile** — Manage address, contact details, MCAZ licence, and operating hours
- **Dashboard Analytics** — Search count, low stock alerts, trending drug searches
- **Security Audit** — Active sessions, login history, login email alert preferences
- **Password Reset** — Self-service password reset via email

### For Admins (Admin Panel — `/admin`)
- **Overview Dashboard** — System-wide KPIs at a glance
- **Pharmacy Approvals** — Review and approve/reject new pharmacy registrations
- **Full User CRUD** — Create, view, edit, and delete pharmacy accounts; change plans; suspend/reactivate
- **Drug Database** — Manage the master list of drugs (generic names, brand names, categories, strengths)
- **Analytics** — System-wide search trends, top drugs, city breakdowns with date range filtering
- **Admin Profile & Settings** — Admin profile editor, password change, and notification preferences
- **CSV/Excel Export** — Export approvals, users, drugs, and analytics data from every admin page

### Security Features
- **Rate Limiting** — Client-side sliding window rate limiter on login and sensitive endpoints
- **Account Lockout** — Progressive lockout after failed login attempts
- **CSRF Protection** — Per-session CSRF tokens on all mutation requests
- **Two-Factor Auth (2FA)** — TOTP-based 2FA with QR code setup and backup codes
- **Session Timeout** — 30-minute inactivity timeout with warning toast and "Stay logged in" option
- **Login Email Alerts** — Toggle notifications for new devices, new locations, failed attempts, password changes
- **Password Strength Meter** — Real-time password policy validation on registration

### Design System
- **Skeuomorphic UI** — Glossy gradients, beveled buttons, recessed inputs, embossed text, and realistic depth
- **Responsive** — Fully functional on mobile (320px+) with bottom nav, stacked layouts, and full-screen modals
- **Dark Mode** — Full dark mode token system with theme toggle

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS + shadcn/ui (skeuomorphic variants) |
| **State** | Zustand (global search state) + React Query (server state) |
| **Routing** | React Router v6 (lazy-loaded pages) |
| **Forms** | React Hook Form + Zod validation |
| **HTTP Client** | Axios (with interceptors for auth, CSRF, rate limiting, retry, dedup) |
| **Icons** | Lucide React |
| **Excel/CSV** | SheetJS (xlsx) |
| **Notifications** | Sonner + shadcn Toast |
| **Backend** | Node.js + Express REST API with PostgreSQL + PostGIS (external) |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/                         # shadcn/ui primitives (Button, Card, Input, Sheet, Dialog, etc.)
│   ├── AddEditDrugSheet.tsx        # Add/Edit drug slide-over with autocomplete
│   ├── AdminLayout.tsx             # Admin sidebar + bottom nav layout
│   ├── AdminRoute.tsx              # Auth guard for admin-only routes
│   ├── CitySelector.tsx            # City dropdown + geolocation button
│   ├── DashboardLayout.tsx         # Pharmacy dashboard sidebar + bottom nav
│   ├── DrugSearchBar.tsx           # Debounced autocomplete search bar
│   ├── EmptyState.tsx              # Empty/no-results placeholder
│   ├── ExportDropdown.tsx          # Reusable CSV/Excel export button
│   ├── ImportModal.tsx             # CSV/Excel import with preview table
│   ├── LoadingSpinner.tsx          # Reusable spinner + full-page loading
│   ├── MathCaptcha.tsx             # Anti-bot math challenge
│   ├── Navbar.tsx                  # Public navigation bar
│   ├── NavLink.tsx                 # Active-aware nav link
│   ├── PaginationControls.tsx      # Reusable pagination with page size selector
│   ├── PasswordStrengthMeter.tsx   # Real-time password policy UI
│   ├── PharmacyResultCard.tsx      # Search result card with stock status
│   ├── ProtectedRoute.tsx          # Auth guard for pharmacy routes
│   ├── StockStatusBadge.tsx        # IN_STOCK / LOW_STOCK / OUT_OF_STOCK badge
│   ├── ThemeToggle.tsx             # Light/dark mode toggle
│   └── security/
│       └── LoginAlertSettings.tsx  # Login email alert toggle UI
├── context/
│   └── AuthContext.tsx             # Auth provider (JWT, session, demo accounts)
├── hooks/
│   ├── use-mobile.tsx              # Mobile breakpoint hook
│   ├── use-pagination.ts           # Generic pagination hook
│   ├── use-theme.tsx               # Theme preference hook
│   └── use-toast.ts                # Toast hook
├── lib/
│   ├── accountLockout.ts           # Progressive lockout logic
│   ├── adminExportUtils.ts         # CSV/Excel export helpers for admin pages
│   ├── api.ts                      # Axios instance with interceptors
│   ├── catTime.ts                  # Time utility
│   ├── csrfToken.ts                # CSRF token manager
│   ├── exportUtils.ts              # CSV/Excel export for pharmacy stock
│   ├── mockData.ts                 # Mock drugs, pharmacies, stock, search logic
│   ├── rateLimiter.ts              # Sliding window rate limiter
│   ├── requestDedup.ts             # GET request deduplication
│   ├── retryLogic.ts               # Exponential backoff retry
│   ├── sessionTimeout.ts           # Inactivity timeout manager
│   └── utils.ts                    # Tailwind merge utility
├── pages/
│   ├── Index.tsx                   # Homepage — hero search + how-it-works
│   ├── SearchResultsPage.tsx       # Drug search results with sorting
│   ├── PharmacyLoginPage.tsx       # Pharmacy sign-in (with 2FA + lockout)
│   ├── PharmacyRegisterPage.tsx    # Pharmacy registration form
│   ├── PharmacyDashboard.tsx       # Dashboard overview with stats
│   ├── StockManagementPage.tsx     # Full stock CRUD + import/export
│   ├── AlertSettingsPage.tsx       # SMS alert configuration
│   ├── PharmacyProfilePage.tsx     # Pharmacy details + operating hours editor
│   ├── SubscriptionPage.tsx        # Plan comparison + upgrade
│   ├── SecurityAuditPage.tsx       # Sessions, login history, security settings
│   ├── ResetPasswordPage.tsx       # Password reset flow
│   ├── NotFound.tsx                # 404 page
│   └── admin/
│       ├── AdminOverviewPage.tsx   # Admin KPI dashboard
│       ├── AdminApprovalsPage.tsx  # Approve/reject pharmacies
│       ├── AdminAnalyticsPage.tsx  # Search analytics with date range filter
│       ├── AdminDrugsPage.tsx      # Master drug database CRUD
│       ├── AdminUsersPage.tsx      # Full user CRUD (create/view/edit/delete)
│       └── AdminProfilePage.tsx    # Admin profile settings & notifications
├── stores/
│   └── searchStore.ts              # Zustand search state (query, city, location)
├── App.tsx                         # Router + providers
├── main.tsx                        # Entry point
└── index.css                       # Design system tokens + skeuomorphic styles
```

---

## 📱 Page Routes

### Public Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Homepage | Hero search bar, how-it-works section |
| `/search?drug=X&city=Y` | Search Results | Pharmacy results with stock status |
| `/pharmacy/register` | Registration | New pharmacy sign-up form |
| `/pharmacy/login` | Login | Sign-in with 2FA, lockout, forgot password |
| `/pharmacy/reset-password` | Password Reset | Email-based password reset |

### Pharmacy Dashboard (requires login)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Overview | Stats, trending searches, quick actions |
| `/dashboard/stock` | Stock Management | Add/edit/delete drugs, import/export CSV/Excel |
| `/dashboard/alerts` | Alert Settings | SMS alert thresholds and frequency |
| `/dashboard/subscription` | Subscription | Plan comparison, upgrade/downgrade |
| `/dashboard/profile` | Profile | Pharmacy info, hours, password change |
| `/dashboard/security` | Security Audit | Sessions, login history, alert preferences |

### Admin Panel (requires admin login)

| Route | Page | Description |
|-------|------|-------------|
| `/admin` | Overview | System KPIs and summary |
| `/admin/approvals` | Approvals | Review pending pharmacy registrations |
| `/admin/analytics` | Analytics | Search trends, top drugs, city data (with date range) |
| `/admin/drugs` | Drug Database | Master drug list CRUD |
| `/admin/users` | User Management | Full CRUD: create, view, edit, delete, suspend, change plan |
| `/admin/profile` | Admin Settings | Profile editor, password change, notification prefs |

---

## 📊 Database Schema

| Table | Purpose |
|-------|---------|
| `pharmacies` | Pharmacy profiles with location, MCAZ licence, status, plan tier |
| `drugs` | Drug database with generic/brand names, categories, and search terms |
| `pharmacy_stock` | Per-pharmacy stock levels with reorder thresholds and pricing |
| `drug_searches` | Search analytics (query, city, result count, timestamp) |
| `stock_alerts` | SMS alert log and delivery status |

### Stock Status Logic

```
IN_STOCK:     quantity > threshold AND is_available = true
LOW_STOCK:    quantity > 0 AND quantity <= threshold AND is_available = true
OUT_OF_STOCK: quantity = 0 OR is_available = false
```

### Subscription Tiers

| Tier | Price | Drug Limit | SMS Alerts | Analytics | API Access | Priority Listing |
|------|-------|-----------|------------|-----------|------------|-----------------|
| **FREE** | $0/mo | 100 | ❌ | ❌ | ❌ | ❌ |
| **BASIC** | $29/mo | 500 | ✅ | Basic | ❌ | ❌ |
| **PRO** | $79/mo | Unlimited | ✅ | Full | ✅ | ✅ |

---

## 🎨 Design System

### Colors (CSS Variables — HSL format)

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | Deep Teal `#007A6E` | Brand, buttons, links |
| `--primary-dark` | `#005A52` | Hover states |
| `--accent` | Mint Green `#00C896` | Success, CTAs |
| `--warning` | Amber `#F59E0B` | Low stock |
| `--destructive` | Red `#EF4444` | Out of stock, errors, admin badge |

### Typography

| Role | Font | Weights |
|------|------|---------|
| Headings | DM Sans | 600, 700 |
| Body | Inter | 400, 500 |
| Drug names / code | JetBrains Mono | 400, 500 |

### Skeuomorphic Effects

- **Cards**: Top-to-bottom gradient with inner highlight and layered drop shadows
- **Buttons**: 3D gradient with top bevel, bottom shadow, press-down active state
- **Inputs**: Recessed/sunken with inset shadows
- **Badges**: Glossy gradient fills with text shadows
- **Toolbars/Navs**: Raised brushed-metal gradient
- **Tables**: Recessed container with gradient headers

---

## 📦 Import / Export

### Import (CSV or Excel)
1. Click **Import** on the Stock Management page
2. Drag & drop or browse for a `.csv` or `.xlsx` file
3. Expected columns: `drug_name`, `quantity`, `unit_price`, `threshold`
4. Preview table shows matched vs unmatched drugs
5. Confirm to import matched drugs into inventory

### Export
- **CSV**: Standard comma-separated values file
- **Excel (.xlsx)**: Formatted spreadsheet with column widths
- Available on: Stock Management, Admin Approvals, Admin Users, Admin Drugs, Admin Analytics

---

## 🔒 Security Architecture

| Feature | Implementation |
|---------|---------------|
| **Authentication** | JWT (localStorage) or httpOnly cookies (`X-Auth-Mode: cookie`) |
| **CSRF Protection** | Per-session token via `X-CSRF-Token` header on mutations |
| **Rate Limiting** | Client-side sliding window (configurable per endpoint) |
| **Account Lockout** | Progressive lockout after failed login attempts |
| **Session Timeout** | 30-min inactivity timeout with 2-min warning |
| **2FA** | TOTP-based with QR code setup and backup codes |
| **Request Dedup** | Identical in-flight GET requests are deduplicated |
| **Retry Logic** | Exponential backoff for transient network errors |
| **Input Sanitization** | XSS prevention via HTML entity stripping |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or Bun

### Installation

```bash
git clone <your-repo-url>
cd pharmtrack
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🔮 Roadmap

- [ ] Connect Supabase / Lovable Cloud backend (database, auth, RLS)
- [ ] Google Maps integration for pharmacy markers
- [ ] SMS alerts via Africa's Talking API (Edge Function)
- [ ] Paynow payment integration for subscriptions
- [ ] WhatsApp bot for drug search
- [ ] PWA support for offline access
- [ ] Role-based admin hierarchy (super admin, regional admin)

---

## 📄 License

This project is proprietary. All rights reserved.

---

Built with ❤️ for Zimbabwe's healthcare ecosystem.
