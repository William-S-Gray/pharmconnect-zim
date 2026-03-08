import { useState, useEffect } from 'react';
import { BarChart3, Package, AlertTriangle, CreditCard, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { getCATGreeting, formatCATTime } from '@/lib/catTime';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const PharmacyDashboard = () => {
  const { pharmacy } = useAuth();
  const [greeting, setGreeting] = useState(getCATGreeting());
  const [catTime, setCatTime] = useState(formatCATTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getCATGreeting());
      setCatTime(formatCATTime());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', pharmacy?.id],
    queryFn: () => api.get('/api/dashboard/stats').then(r => r.data),
    enabled: !!pharmacy,
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
          {greeting}, {pharmacy?.name || 'Pharmacy'} 👋
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {catTime} CAT · Here's your overview for today
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
          <div className="space-y-3">
            {recentAlerts.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent alerts</p>
            )}
            {recentAlerts.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-mono-drug text-sm font-medium text-foreground">{item.common_name}</p>
                  <p className="text-xs text-muted-foreground">{item.sent_at ? new Date(item.sent_at).toLocaleDateString() : ''}</p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/dashboard/stock">Update</Link>
                </Button>
              </div>
            ))}
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
