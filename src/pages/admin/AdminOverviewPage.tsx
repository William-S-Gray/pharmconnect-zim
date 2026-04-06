import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, Users, Database, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
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
  { key: 'pending_approvals' as const, label: 'Pending Approvals', icon: CheckSquare, color: 'text-orange-500', bg: 'bg-orange-500/10', format: undefined as ((v: number) => string) | undefined },
  { key: 'total_pharmacies' as const, label: 'Total Pharmacies', icon: Users, color: 'text-primary', bg: 'bg-primary/10', format: undefined as ((v: number) => string) | undefined },
  { key: 'total_drugs' as const, label: 'Drugs in Database', icon: Database, color: 'text-green-500', bg: 'bg-green-500/10', format: undefined as ((v: number) => string) | undefined },
  { key: 'searches_today' as const, label: 'Searches Today', icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-500/10', format: undefined as ((v: number) => string) | undefined },
  { key: 'stock_alerts' as const, label: 'Stock Alerts', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', format: undefined as ((v: number) => string) | undefined },
  { key: 'growth_30d' as const, label: 'Growth (30d)', icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10', format: (v: number) => `${v > 0 ? '+' : ''}${v}%` },
];

const AdminOverviewPage = () => {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      // Pending Approvals
      const { count: pending } = await supabase
        .from('pharmacies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
        
      // Total Pharmacies
      const { count: total } = await supabase
        .from('pharmacies')
        .select('*', { count: 'exact', head: true });
        
      // Total Drugs
      const { count: drugs } = await supabase
        .from('drugs')
        .select('*', { count: 'exact', head: true });

      return {
        pending_approvals: pending || 0,
        total_pharmacies: total || 0,
        total_drugs: drugs || 0,
        searches_today: 0, // Requires search_logs table
        stock_alerts: 0,    // Requires stock_inventory table
        growth_30d: 0,       // Calculation based on pharmacy growth
      };
    },
    placeholderData: fallbackStats,
  });

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ['admin', 'activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (error) return [];
      
      return data.map(log => ({
        action: log.event_type.replace(/_/g, ' '),
        detail: `User ${log.user_id.slice(0, 8)} performed ${log.event_type}`,
        time: new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })) as ActivityItem[];
    },
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
