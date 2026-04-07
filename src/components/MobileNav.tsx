import { Link, useLocation } from 'react-router-dom';
import { Pill, Menu, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  badgeKey?: string;
}

interface MobileNavProps {
  items: NavItem[];
  pharmacyName?: string;
  role?: string;
  badgeCounts?: Record<string, number>;
  onLogout: () => void;
  brandName?: string;
  adminContext?: boolean;
}

export function MobileNav({ 
  items, 
  pharmacyName, 
  role, 
  badgeCounts = {}, 
  onLogout,
  brandName = "PharmConnect Zim",
  adminContext = false
}: MobileNavProps) {
  const location = useLocation();

  return (
    <header className="md:hidden sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to={adminContext ? "/admin" : "/dashboard"} className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shadow-sm",
            adminContext ? "bg-destructive/90" : "brand-icon-skeu"
          )}>
            <Pill className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-bold text-foreground text-emboss text-sm leading-tight">{brandName}</span>
            {adminContext && <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider leading-none">Admin</span>}
          </div>
        </Link>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 p-0 hover:bg-muted/50 rounded-full">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
              {(badgeCounts.deleteRequests > 0 || badgeCounts.conflicts > 0) && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive border-2 border-background rounded-full" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col w-[300px] sm:w-[350px] p-0 border-l border-border glass-panel">
            <SheetHeader className="p-6 border-b border-border text-left">
              <SheetTitle>
                <div className="flex flex-col gap-1">
                  <p className="font-heading font-semibold text-base truncate text-foreground">{pharmacyName || 'Pharmacy'}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-[10px] px-2 py-0 h-4 border-none",
                      adminContext ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                    )}>
                      {role?.replace('_', ' ').toUpperCase() || 'USER'}
                    </Badge>
                  </div>
                </div>
              </SheetTitle>
            </SheetHeader>

            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-none">
              {items.map((item) => {
                const isActive = item.path === (adminContext ? '/admin' : '/dashboard')
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all duration-200',
                      isActive
                        ? 'font-medium text-primary-foreground btn-skeu-primary pointer-events-none'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.98]'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <Badge className={cn(
                        "ml-auto text-[10px] h-4 px-1.5 min-w-[18px] flex items-center justify-center border-none",
                        item.label.includes('Delete') ? "bg-orange-500" : "bg-primary"
                      )}>
                        {count}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-border bg-muted/30">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-xs text-muted-foreground">System Settings</span>
                  <ThemeToggle />
                </div>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-3 h-11 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                  onClick={onLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
