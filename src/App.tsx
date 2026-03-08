import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { DashboardLayout } from "./components/DashboardLayout";

const SearchResultsPage = lazy(() => import("./pages/SearchResultsPage"));
const PharmacyRegisterPage = lazy(() => import("./pages/PharmacyRegisterPage"));
const PharmacyLoginPage = lazy(() => import("./pages/PharmacyLoginPage"));
const PharmacyDashboard = lazy(() => import("./pages/PharmacyDashboard"));
const StockManagementPage = lazy(() => import("./pages/StockManagementPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const AlertSettingsPage = lazy(() => import("./pages/AlertSettingsPage"));
const PharmacyProfilePage = lazy(() => import("./pages/PharmacyProfilePage"));

const queryClient = new QueryClient();

function PageLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/pharmacy/register" element={<PharmacyRegisterPage />} />
            <Route path="/pharmacy/login" element={<PharmacyLoginPage />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<PharmacyDashboard />} />
              <Route path="stock" element={<StockManagementPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
