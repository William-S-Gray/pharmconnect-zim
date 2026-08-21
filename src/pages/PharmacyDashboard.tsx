import { useState, useEffect } from 'react';
import { BarChart3, Package, AlertTriangle, CreditCard, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { getCATGreeting, formatCATTime } from '@/lib/catTime';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PharmacyDashboard = () => {
  const { pharmacy, profile, role } = useAuth();
  const [greeting, setGreeting] = useState(getCATGreeting());
  const [catTime, setCatTime] = useState(formatCATTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getCATGreeting());
      setCatTime(formatCATTime());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getRoleDisplay = () => {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'pharmacy_admin') return 'Pharmacy Admin';
    return 'Staff Member';
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return null;
      // One request. Trending searches are ranked across the whole month
      // in SQL; the version this replaces pulled the last 30 raw rows and
      // counted them in the browser, so "top searched" was a sample of 30.
      return api.pharmacies.dashboard(pharmacy.id);
    },
    enabled: !!pharmacy?.id,
  });

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingSpinner size="lg" label="Loading dashboard..." />
      </div>
    );
  }

  const statCards = [
    { label: 'Searches this month', value: stats?.searches_this_month?.toString() || '0', icon: BarChart3, color: 'text-primary' },
    { label: 'Drugs Listed', value: stats?.stock?.total?.toString() || '0', icon: Package, color: 'text-primary' },
    { label: 'Low Stock Items', value: stats?.stock?.low_stock?.toString() || '0', icon: AlertTriangle, color: 'text-warning' },
    { label: 'Current Plan', value: stats?.plan_tier || pharmacy?.plan_tier || 'FREE', icon: CreditCard, color: 'text-accent' },
  ];

  const topSearches = stats?.top_searched_drugs || [];
  const recentAlerts = stats?.recent_alerts || [];

  return (
    <div className="space-y-6 animate-fade-in">

      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground">
          {greeting}, {profile?.full_name || 'User'} 👋
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {catTime} CAT · You are logged into <span className="font-semibold text-foreground">{pharmacy?.name || 'your pharmacy'}</span> as <span className="font-semibold text-foreground">{getRoleDisplay()}</span>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center stat-icon-skeu">
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              </div>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <span className="font-heading font-bold text-2xl text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Low stock / recent alerts */}
        <div className="card-pharma">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-foreground">Low Stock Alerts</h2>
            <Link to="/dashboard/stock" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-4">
            {recentAlerts.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center bg-muted/20 rounded-xl border border-dashed">
                No low stock alerts. <br/> Your inventory looks healthy!
              </p>
            )}
            {recentAlerts.slice(0, 5).map((item: any, i: number) => {
              const percentage = Math.min(100, (item.quantity / (item.threshold || 1)) * 100);
              const isCritical = item.quantity === 0;
              
              return (
                <div key={i} className="group p-3 rounded-xl border border-transparent hover:bg-muted/30 hover:border-border/50 transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm text-foreground">{item.common_name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono-drug uppercase tracking-tighter">
                        {item.strength} · Threshold: {item.threshold}
                      </p>
                    </div>
                    <Badge className={cn(
                      "text-[10px] px-1.5 py-0 h-4 border-none",
                      isCritical ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                    )}>
                      {isCritical ? 'OUT OF STOCK' : 'LOW STOCK'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden skeu-inset">
                      <div 
                        className={cn(
                          "h-full transition-all duration-500 ease-out",
                          isCritical ? "bg-red-500" : "bg-amber-500"
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className={cn(
                        "text-xs font-bold font-mono-drug w-12 text-right",
                        isCritical ? "text-red-600" : "text-amber-600"
                    )}>
                        {item.quantity}/{item.threshold}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 hover:bg-primary/10 hover:text-primary transition-colors" asChild>
                      <Link to="/dashboard/stock?search={item.common_name}">Update</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top searches */}
        <div className="card-pharma">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-foreground">Trending Searches</h2>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {topSearches.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No search data yet</p>
            )}
            {topSearches.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center rank-badge-skeu">
                    {i + 1}
                  </span>
                  <span className="font-mono-drug text-sm font-medium text-foreground">
                    {item.common_name} {item.strength}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{item.search_count} searches</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade banner */}
      <div className="rounded-xl p-5 border upgrade-banner-skeu">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading font-semibold text-foreground">
              You were searched {stats?.searches_this_month || 0} times this month
            </h3>
            <p className="text-sm text-muted-foreground">Upgrade to see who searched and when — from $29/month</p>
          </div>
          <Button asChild>
            <Link to="/dashboard/subscription">Upgrade Plan</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PharmacyDashboard;

