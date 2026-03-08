# PharmTrack 💊

**Real-time medicine availability network for Zimbabwe**

PharmTrack connects patients to pharmacies by showing which nearby pharmacy has the medicine they need in stock — live. Pharmacies manage their inventory, receive SMS low-stock alerts, and gain analytics on what patients are searching for.

---

## 🎯 Problem Statement

In Zimbabwe, patients often visit multiple pharmacies before finding the medicine they need. PharmTrack solves this by providing a centralized, real-time search engine for pharmacy stock across Harare, Mutare, Bulawayo, and Gweru.

---

## ✨ Features

### For Patients (No Login Required)
- **Drug Search** — Autocomplete search across 20+ common medicines by generic name, brand name, or local term
- **Pharmacy Results** — See which pharmacies have your drug in stock, sorted by availability, distance, or price
- **Real-time Status** — IN STOCK / LOW STOCK / OUT OF STOCK indicators with quantity and pricing
- **City Filtering** — Filter by city or use GPS geolocation
- **Click-to-Call** — One-tap phone dialling to the pharmacy

### For Pharmacies (Dashboard)
- **Stock Management** — Full CRUD: Add, edit, and remove drugs from inventory
- **Import / Export** — Bulk import stock from CSV or Excel (.xlsx); export current inventory to CSV or Excel
- **Alert Settings** — Configure SMS alerts for low stock, set per-drug thresholds, choose frequency (daily/weekly)
- **Subscription Plans** — Free, Basic ($29/mo), Pro ($79/mo) tiers with increasing capabilities
- **Pharmacy Profile** — Manage address, contact details, MCAZ licence, and operating hours
- **Dashboard Analytics** — Search count, low stock alerts, trending drug searches

### Design System
- **Skeuomorphic UI** — Glossy gradients, beveled buttons, recessed inputs, embossed text, and realistic depth
- **Responsive** — Fully functional on mobile (320px+) with bottom nav, stacked layouts, and full-screen modals
- **Dark Mode Ready** — Full dark mode token system defined

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS + shadcn/ui |
| **State** | Zustand (global) + React Query (server) |
| **Routing** | React Router v6 |
| **Forms** | React Hook Form + Zod |
| **Icons** | Lucide React |
| **Excel/CSV** | SheetJS (xlsx) |
| **Notifications** | Sonner + shadcn Toast |
| **Backend** | Supabase (PostgreSQL + Auth + Edge Functions) — *to be connected* |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/                    # shadcn/ui primitives (Button, Card, Input, Sheet, etc.)
│   ├── AddEditDrugSheet.tsx   # Add/Edit drug slide-over with autocomplete
│   ├── CitySelector.tsx       # City dropdown + geolocation button
│   ├── DashboardLayout.tsx    # Sidebar + bottom nav layout for pharmacy dashboard
│   ├── DrugSearchBar.tsx      # Debounced autocomplete search bar
│   ├── EmptyState.tsx         # Empty/no-results placeholder
│   ├── ImportModal.tsx        # CSV/Excel import with preview table
│   ├── LoadingSpinner.tsx     # Reusable spinner + full-page loading
│   ├── Navbar.tsx             # Public navigation bar
│   ├── PharmacyResultCard.tsx # Search result card with stock status
│   └── StockStatusBadge.tsx   # IN_STOCK / LOW_STOCK / OUT_OF_STOCK badge
├── hooks/
│   ├── use-mobile.tsx         # Mobile breakpoint hook
│   └── use-toast.ts           # Toast hook
├── lib/
│   ├── exportUtils.ts         # CSV and Excel export functions
│   ├── mockData.ts            # Mock drugs, pharmacies, stock, and search logic
│   └── utils.ts               # Tailwind merge utility
├── pages/
│   ├── Index.tsx              # Homepage — hero search + how-it-works
│   ├── SearchResultsPage.tsx  # Drug search results with sorting
│   ├── PharmacyLoginPage.tsx  # Pharmacy sign-in
│   ├── PharmacyRegisterPage.tsx # Pharmacy registration form
│   ├── PharmacyDashboard.tsx  # Dashboard overview with stats
│   ├── StockManagementPage.tsx # Full stock CRUD + import/export
│   ├── AlertSettingsPage.tsx  # SMS alert configuration
│   ├── PharmacyProfilePage.tsx # Pharmacy details editor
│   ├── SubscriptionPage.tsx   # Plan comparison + upgrade
│   └── NotFound.tsx           # 404 page
├── stores/
│   └── searchStore.ts         # Zustand search state (query, city, location)
├── App.tsx                    # Router + providers
├── main.tsx                   # Entry point
└── index.css                  # Design system tokens + skeuomorphic styles
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or Bun

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd pharmtrack

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🎨 Design System

### Colors (CSS Variables — HSL format)

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | Deep Teal `#007A6E` | Brand, buttons, links |
| `--primary-dark` | `#005A52` | Hover states |
| `--accent` | Mint Green `#00C896` | Success, CTAs |
| `--warning` | Amber `#F59E0B` | Low stock |
| `--destructive` | Red `#EF4444` | Out of stock, errors |

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

## 📊 Database Schema

| Table | Purpose |
|-------|---------|
| `pharmacies` | Pharmacy profiles with location, status, plan tier |
| `drugs` | Drug database with generic/brand names and search terms |
| `pharmacy_stock` | Per-pharmacy stock levels with thresholds and pricing |
| `drug_searches` | Search analytics (what, where, how many results) |
| `stock_alerts` | SMS alert log |

### Stock Status Logic

```
IN_STOCK:     quantity > threshold AND is_available = true
LOW_STOCK:    quantity > 0 AND quantity <= threshold AND is_available = true
OUT_OF_STOCK: quantity = 0 OR is_available = false
```

---

## 📱 Page Routes

| Route | Page | Auth |
|-------|------|------|
| `/` | Homepage with drug search | Public |
| `/search?drug=X&city=Y` | Search results | Public |
| `/pharmacy/register` | Pharmacy registration | Public |
| `/pharmacy/login` | Pharmacy login | Public |
| `/dashboard` | Dashboard overview | Pharmacy |
| `/dashboard/stock` | Stock management (CRUD + import/export) | Pharmacy |
| `/dashboard/alerts` | Alert settings | Pharmacy |
| `/dashboard/subscription` | Plan & billing | Pharmacy |
| `/dashboard/profile` | Pharmacy profile | Pharmacy |

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

---

## 🔮 Roadmap

- [ ] Connect Supabase backend (database, auth, RLS)
- [ ] Google Maps integration for pharmacy markers
- [ ] SMS alerts via Africa's Talking API (Edge Function)
- [ ] Paynow payment integration for subscriptions
- [ ] Admin panel for pharmacy approval and drug management
- [ ] WhatsApp bot for drug search
- [ ] PWA support for offline access

---

## 📄 License

This project is proprietary. All rights reserved.

---

Built with ❤️ for Zimbabwe's healthcare ecosystem.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
