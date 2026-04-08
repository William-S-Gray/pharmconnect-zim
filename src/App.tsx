import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { FullPageSpinner } from "./components/LoadingSpinner";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { DashboardLayout } from "./components/DashboardLayout";
import { AdminLayout } from "./components/AdminLayout";

const SearchResultsPage = lazy(() => import("./pages/SearchResultsPage"));
const DrugDiscoveryPage = lazy(() => import("./pages/DrugDiscoveryPage"));
const PharmacyRegisterPage = lazy(() => import("./pages/PharmacyRegisterPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const PharmacyDashboard = lazy(() => import("./pages/PharmacyDashboard"));
const StockManagementPage = lazy(() => import("./pages/StockManagementPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const AlertSettingsPage = lazy(() => import("./pages/AlertSettingsPage"));
const PharmacyProfilePage = lazy(() => import("./pages/PharmacyProfilePage"));
const SecurityAuditPage = lazy(() => import("./pages/SecurityAuditPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PharmacyRequestsPage = lazy(() => import("./pages/PharmacyRequestsPage"));
const PharmacyApprovalsPage = lazy(() => import("./pages/PharmacyApprovalsPage"));
const PharmacyStaffPage = lazy(() => import("./pages/PharmacyStaffPage"));
const PharmacyDeleteRequestsPage = lazy(() => import("./pages/PharmacyDeleteRequestsPage"));
const TrashPage = lazy(() => import("./pages/TrashPage"));
const UserManagementPage = lazy(() => import("./pages/admin/UserManagementPage"));
const ReservationsPage = lazy(() => import("./pages/ReservationsPage"));

// Admin pages
const AdminOverviewPage = lazy(() => import("./pages/admin/AdminOverviewPage"));
const AdminApprovalsPage = lazy(() => import("./pages/admin/AdminApprovalsPage"));
const AdminAnalyticsPage = lazy(() => import("./pages/admin/AdminAnalyticsPage"));
const AdminDrugsPage = lazy(() => import("./pages/admin/AdminDrugsPage"));
const AdminPharmaciesPage = lazy(() => import("./pages/admin/AdminPharmaciesPage"));
const AdminStaffPage = lazy(() => import("./pages/admin/AdminStaffPage"));
const AdminProfilePage = lazy(() => import("./pages/admin/AdminProfilePage"));
const AdminAuditLogPage = lazy(() => import("./pages/admin/AdminAuditLogPage"));
const AdminDeleteRequestsPage = lazy(() => import("./pages/admin/AdminDeleteRequestsPage"));
const ConflictManagementPage = lazy(() => import("./pages/admin/ConflictManagementPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoading() {
  return <FullPageSpinner />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter 
        future={{ 
          v7_startTransition: true, 
          v7_relativeSplatPath: true 
        }}
      >
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/discover" element={<DrugDiscoveryPage />} />
            <Route path="/pharmacy/register" element={<PharmacyRegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/pharmacy/reset-password" element={<ResetPasswordPage />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<PharmacyDashboard />} />
              <Route path="stock" element={<StockManagementPage />} />
              <Route path="requests" element={<PharmacyRequestsPage />} />
              <Route path="approvals" element={<PharmacyApprovalsPage />} />
              <Route path="staff" element={<UserManagementPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="delete-requests" element={<PharmacyDeleteRequestsPage />} />
              <Route path="trash" element={<TrashPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
              <Route path="alerts" element={<AlertSettingsPage />} />
              <Route path="profile" element={<PharmacyProfilePage />} />
              <Route path="security" element={<SecurityAuditPage />} />
              <Route path="conflicts" element={<ConflictManagementPage />} />
              <Route path="reservations" element={<ReservationsPage />} />
            </Route>
            <Route path="/admin" element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }>
              <Route index element={<AdminOverviewPage />} />
              <Route path="approvals" element={<AdminApprovalsPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="drugs" element={<AdminDrugsPage />} />
              <Route path="pharmacies" element={<AdminPharmaciesPage />} />
              <Route path="staff" element={<UserManagementPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="delete-requests" element={<AdminDeleteRequestsPage />} />
              <Route path="trash" element={<TrashPage />} />
              <Route path="audit-log" element={<AdminAuditLogPage />} />
              <Route path="profile" element={<AdminProfilePage />} />
              <Route path="conflicts" element={<ConflictManagementPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
