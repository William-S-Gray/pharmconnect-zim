import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { Pill, LayoutDashboard, CheckSquare, BarChart3, Database, Users, LogOut, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';

const adminNavItems = [
  { label: 'Overview', icon: LayoutDashboard, path: '/admin' },
  { label: 'Approvals', icon: CheckSquare, path: '/admin/approvals' },
  { label: 'Analytics', icon: BarChart3, path: '/admin/analytics' },
  { label: 'Drug Database', icon: Database, path: '/admin/drugs' },
  { label: 'Users', icon: Users, path: '/admin/users' },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pharmacy, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-border fixed inset-y-0 left-0 z-40 sidebar-skeu">
        <div className="p-4 border-b border-border">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive/90 shadow-sm">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-heading font-bold text-foreground text-emboss block text-sm">PharmTrack</span>
              <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider">Admin</span>
            </div>
          </Link>
        </div>

        <div className="px-3 py-4">
          <div className="card-pharma mb-4 p-3">
            <p className="font-heading font-semibold text-sm truncate text-foreground">{pharmacy?.name || 'Admin'}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">ADMIN</span>
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
                {item.label}
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

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around py-2 px-1 border-t border-border mobile-nav-skeu">
        {adminNavItems.slice(0, 5).map((item) => {
          const isActive = item.path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 text-[10px] p-1.5 rounded-lg transition-all',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label.split(' ')[0]}
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
  );
}
