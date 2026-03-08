import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Skeleton } from '@/components/ui/skeleton';

interface AnalyticsData {
  summary: { label: string; value: string }[];
  daily_searches: { day: string; searches: number }[];
  stock_distribution: { name: string; value: number; color: string }[];
  top_drugs: { name: string; searches: number }[];
  registration_trend: { month: string; pharmacies: number }[];
  city_breakdown: { city: string; count: number }[];
}

const fallbackData: AnalyticsData = {
  summary: [], daily_searches: [], stock_distribution: [],
  top_drugs: [], registration_trend: [], city_breakdown: [],
};

const AdminAnalyticsPage = () => {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['admin', 'analytics'],
    queryFn: async () => {
      const res = await api.get('/api/admin/analytics');
      return res.data;
    },
    retry: 1,
    placeholderData: fallbackData,
  });

  const d = data || fallbackData;
  const maxCity = Math.max(...d.city_breakdown.map(c => c.count), 1);

  if (isLoading) {
    return (
      <div className="py-16"><LoadingSpinner size="lg" label="Loading analytics..." /></div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">System Analytics</h1>
        <p className="text-muted-foreground text-sm">Network-wide statistics and trends</p>
      </div>

      {d.summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {d.summary.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {d.daily_searches.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Daily Searches (This Week)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={d.daily_searches}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="searches" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {d.stock_distribution.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Stock Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={d.stock_distribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                    {d.stock_distribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {d.top_drugs.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Most Searched Drugs</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={d.top_drugs} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="searches" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {d.registration_trend.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Pharmacy Registrations</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={d.registration_trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="pharmacies" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {d.city_breakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pharmacies by City</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {d.city_breakdown.map((c) => (
                <div key={c.city} className="flex items-center gap-3">
                  <span className="text-sm w-20 text-foreground font-medium">{c.city}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/80 rounded-full transition-all" style={{ width: `${(c.count / maxCity) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-8 text-right">{c.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!d.summary.length && !d.daily_searches.length && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No analytics data available. Data will appear once the backend is connected.</CardContent></Card>
      )}
    </div>
  );
};

export default AdminAnalyticsPage;
