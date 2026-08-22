import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { Pill, LayoutDashboard, Package, Bell, CreditCard, Settings, LogOut, Shield, MessageCircle, CheckSquare, Users, ShieldAlert, Trash2, BarChart3, AlertTriangle, ShoppingBag, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { PersistentAlertList } from '@/components/PersistentAlertList';
import { ConnectivityBanner } from './ConnectivityBanner';
import { MobileNav } from './MobileNav';

const navItems = [
  { label: 'Dashboard',      icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Reservations',   icon: ShoppingBag,     path: '/dashboard/reservations' },
  { label: 'Requested Drugs',icon: MessageCircle,   path: '/dashboard/requests' },
  { label: 'Inventory',      icon: Package,         path: '/dashboard/stock' },
  { label: 'Quick Update',   icon: Zap,             path: '/dashboard/quick-update' },
  { label: 'Staff Approvals', icon: CheckSquare, path: '/dashboard/approvals', adminOnly: true },
  { label: 'User Management', icon: Users, path: '/dashboard/users', adminOnly: true },
  { label: 'Analytics', icon: BarChart3, path: '/dashboard/analytics', adminOnly: true },
  { label: 'Delete Requests', icon: ShieldAlert, path: '/dashboard/delete-requests', adminOnly: true },
  { label: 'Pharmacy Trash', icon: Trash2, path: '/dashboard/trash', adminOnly: true },
  { label: 'Sync Conflicts', icon: AlertTriangle, path: '/dashboard/conflicts', adminOnly: true },
  { label: 'Alert Settings', icon: Bell, path: '/dashboard/alerts' },
  { label: 'Subscription', icon: CreditCard, path: '/dashboard/subscription' },
  { label: 'Profile', icon: Settings, path: '/dashboard/profile' },
  { label: 'Security', icon: Shield, path: '/dashboard/security' },
];

export function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { pharmacy, role, profile, logout } = useAuth();
  
  // One request for every badge, rather than three head-count queries on
  // separate intervals.
  const { data: counts } = useQuery({
    queryKey: ['pharmacy', 'counts', pharmacy?.id],
    queryFn: () => api.pharmacies.counts(pharmacy!.id),
    enabled: !!pharmacy?.id,
    refetchInterval: 30000,
  });
  const pendingCount = role === 'pharmacy_admin' ? counts?.pending_deletes ?? 0 : 0;
  const conflictsCount = role === 'pharmacy_admin' ? counts?.conflicts ?? 0 : 0;
  const reservationsCount = counts?.reservations ?? 0;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ConnectivityBanner />
      <MobileNav 
        items={navItems}
        pharmacyName={pharmacy?.name}
        role={role || 'USER'}
        badgeCounts={{ 
          deleteRequests: pendingCount,
          conflicts: conflictsCount
        }}
        onLogout={handleLogout}
      />
      {/* Sidebar Wrapper */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 flex-col border-r border-border fixed inset-y-0 left-0 z-40 sidebar-skeu">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center brand-icon-skeu">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-bold text-foreground text-emboss">PharmConnect Zim</span>
          </Link>
          <NotificationBell />
        </div>

        <div className="px-3 py-4">
          <div className="card-pharma mb-4 p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-border overflow-hidden bg-muted flex items-center justify-center shrink-0 shadow-inner">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-semibold text-sm truncate text-foreground">{profile?.full_name || 'User'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{pharmacy?.name || 'No Pharmacy'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                pharmacy?.status === 'APPROVED' ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-600"
              )}>
                {pharmacy?.status || 'PENDING'}
              </span>
              <Badge variant="outline" className="text-[9px] font-bold h-4 px-1 border-primary/20 bg-primary/5 text-primary">
                {role?.replace('_', ' ').toUpperCase() || 'STAFF'}
              </Badge>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.filter(item => !item.adminOnly || role === 'pharmacy_admin').map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                  isActive
                    ? 'font-medium text-primary-foreground btn-skeu-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {item.label === 'Delete Requests' && pendingCount > 0 && (
                  <Badge className="ml-auto bg-orange-500 text-[10px] h-4 px-1.5 min-w-[18px] flex items-center justify-center border-none">
                    {pendingCount}
                  </Badge>
                )}
                {item.label === 'Sync Conflicts' && conflictsCount > 0 && (
                  <Badge className="ml-auto bg-primary text-[10px] h-4 px-1.5 min-w-[18px] flex items-center justify-center border-none">
                    {conflictsCount}
                  </Badge>
                )}
                {item.label === 'Reservations' && reservationsCount > 0 && (
                  <Badge className="ml-auto text-[10px] h-4 px-1.5 min-w-[18px] flex items-center justify-center border-none animate-pulse" style={{ background: 'hsl(0 72% 51%)' }}>
                    {reservationsCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border flex items-center justify-between">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile bottom nav - simplified to top 4 items */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around py-2 px-1 border-t border-border bg-background/80 backdrop-blur-md">
        {navItems.filter(item => !item.adminOnly || role === 'pharmacy_admin').slice(0, 4).map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 text-[10px] p-2 rounded-xl transition-all duration-200',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pb-20 md:pb-0 scroll-smooth">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <PersistentAlertList />
          {children}
          <Outlet />
        </div>
      </main>
    </div>
    </div>
  );
}
