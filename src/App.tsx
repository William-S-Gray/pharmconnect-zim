import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { FullPageSpinner } from "./components/LoadingSpinner";
import { ProtectedRoute } from "./components/ProtectedRoute";
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
  return <FullPageSpinner />;
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
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<PharmacyDashboard />} />
              <Route path="stock" element={<StockManagementPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
              <Route path="alerts" element={<AlertSettingsPage />} />
              <Route path="profile" element={<PharmacyProfilePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
