import { Link, useLocation, Outlet } from 'react-router-dom';
import { Pill, LayoutDashboard, Package, Bell, CreditCard, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Stock Management', icon: Package, path: '/dashboard/stock' },
  { label: 'Alert Settings', icon: Bell, path: '/dashboard/alerts' },
  { label: 'Subscription', icon: CreditCard, path: '/dashboard/subscription' },
  { label: 'Profile', icon: Settings, path: '/dashboard/profile' },
];

export function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card fixed inset-y-0 left-0 z-40">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Pill className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-foreground">PharmTrack</span>
          </Link>
        </div>

        <div className="px-3 py-4">
          <div className="card-pharma mb-4 p-3">
            <p className="font-heading font-semibold text-sm truncate">Halsteads Pharmacy</p>
            <span className="badge-approved text-[10px] mt-1">Approved</span>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <LogOut className="w-4 h-4" /> Logout
          </Link>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-40 flex justify-around py-2 px-1">
        {navItems.slice(0, 4).map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 text-[10px] p-1.5 rounded-lg transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label.split(' ')[0]}
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pb-20 md:pb-0">
        <div className="p-4 md:p-8">
          {children}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
