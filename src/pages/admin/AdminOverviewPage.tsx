import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, Users, Database, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminStats {
  pending_approvals: number;
  total_pharmacies: number;
  total_drugs: number;
  searches_today: number;
  stock_alerts: number;
  growth_30d: number;
}

interface ActivityItem {
  action: string;
  detail: string;
  time: string;
}

const fallbackStats: AdminStats = {
  pending_approvals: 0, total_pharmacies: 0, total_drugs: 0,
  searches_today: 0, stock_alerts: 0, growth_30d: 0,
};

const iconMap = [
  { key: 'pending_approvals', label: 'Pending Approvals', icon: CheckSquare, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { key: 'total_pharmacies', label: 'Total Pharmacies', icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
  { key: 'total_drugs', label: 'Drugs in Database', icon: Database, color: 'text-green-500', bg: 'bg-green-500/10' },
  { key: 'searches_today', label: 'Searches Today', icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'stock_alerts', label: 'Stock Alerts', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  { key: 'growth_30d', label: 'Growth (30d)', icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10', format: (v: number) => `${v > 0 ? '+' : ''}${v}%` },
] as const;

const AdminOverviewPage = () => {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await api.get('/api/admin/stats');
      return res.data;
    },
    retry: 1,
    placeholderData: fallbackStats,
  });

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ['admin', 'activity'],
    queryFn: async () => {
      const res = await api.get('/api/admin/activity');
      return res.data;
    },
    retry: 1,
    placeholderData: [],
  });

  const s = stats || fallbackStats;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm">System overview and quick actions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {iconMap.map((item) => {
          const raw = s[item.key as keyof AdminStats];
          const value = item.format ? item.format(raw) : raw.toLocaleString();
          return (
            <Card key={item.key}>
              <CardContent className="p-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg} mb-2`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                )}
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="py-4"><LoadingSpinner label="Loading activity..." /></div>
          ) : (activity && activity.length > 0) ? (
            <div className="space-y-0">
              {activity.map((item, i) => (
                <div key={i} className="flex items-start justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-4">{item.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOverviewPage;
