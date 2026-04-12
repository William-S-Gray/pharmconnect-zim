import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { Pill, LayoutDashboard, CheckSquare, BarChart3, Database, Users, Store, LogOut, Settings, ScrollText, UserCog, Trash2, ShieldAlert, AlertTriangle, ShoppingBag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConnectivityBanner } from './ConnectivityBanner';
import { MobileNav } from './MobileNav';

const adminNavItems = [
  { label: 'Overview', icon: LayoutDashboard, path: '/admin' },
  { label: 'Approvals', icon: CheckSquare, path: '/admin/approvals' },
  { label: 'Analytics', icon: BarChart3, path: '/admin/analytics' },
  { label: 'Supply IQ', icon: BarChart3, path: '/admin/supply-iq' },
  { label: 'Drug Database', icon: Database, path: '/admin/drugs' },
  { label: 'Pharmacies', icon: Store, path: '/admin/pharmacies' },
  { label: 'Reservations', icon: ShoppingBag, path: '/admin/reservations' },
  { label: 'User Management', icon: Users, path: '/admin/users' },
  { label: 'Delete Requests', icon: ShieldAlert, path: '/admin/delete-requests', badgeKey: 'deleteRequests' },
  { label: 'System Trash', icon: Trash2, path: '/admin/trash' },
  { label: 'Audit Log', icon: ScrollText, path: '/admin/audit-log' },
  { label: 'Sync Conflicts', icon: AlertTriangle, path: '/admin/conflicts', badgeKey: 'conflicts' },
  { label: 'Settings', icon: Settings, path: '/admin/profile' },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pharmacy, profile, logout } = useAuth();
  
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['admin', 'pending-delete-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('delete_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      if (error) return 0;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: conflictsCount = 0 } = useQuery({
    queryKey: ['admin', 'conflicts-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('sync_conflicts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      if (error) return 0;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ConnectivityBanner />
      <MobileNav 
        items={adminNavItems}
        pharmacyName={pharmacy?.name || 'Admin'}
        role="ADMIN"
        badgeCounts={{ 
          deleteRequests: pendingCount,
          conflicts: conflictsCount
        }}
        onLogout={handleLogout}
        adminContext
      />
      <div className="flex-1 flex">
        <aside className="hidden md:flex w-60 flex-col border-r border-border fixed inset-y-0 left-0 z-40 sidebar-skeu">
        <div className="p-4 border-b border-border">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive/90 shadow-sm">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-heading font-bold text-foreground text-emboss block text-sm">PharmConnect Zim</span>
              <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider">Admin</span>
            </div>
          </Link>
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
                <p className="font-heading font-semibold text-sm truncate text-foreground">{profile?.full_name || 'Admin User'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                   <span className="text-[10px] text-destructive font-bold uppercase tracking-tighter">System Super Admin</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
               <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[100px]">
                 {profile?.email}
               </span>
               <Badge className="bg-destructive/10 text-destructive text-[9px] h-4 px-1.5 border-none shadow-none">
                 LEVEL 1
               </Badge>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {adminNavItems.map((item) => {
            const isActive = item.path === '/admin'
              ? location.pathname === '/admin'
              : location.pathname.startsWith(item.path);
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
        {adminNavItems.slice(0, 4).map((item) => {
          const isActive = item.path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname.startsWith(item.path);
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

      <main className="flex-1 md:ml-60 pb-20 md:pb-0">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
    </div>
  );
}
