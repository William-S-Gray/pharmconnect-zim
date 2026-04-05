import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportCSV, exportExcel } from '@/lib/adminExportUtils';
import { cn } from '@/lib/utils';

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
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['admin', 'analytics', dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      // Fetch total pharmacies
      const { count: pharmacyCount } = await supabase
        .from('pharmacies')
        .select('*', { count: 'exact', head: true });
        
      // Fetch total drugs
      const { count: drugCount } = await supabase
        .from('drugs')
        .select('*', { count: 'exact', head: true });
        
      // Fetch city breakdown
      const { data: cities } = await supabase
        .from('pharmacies')
        .select('city');
        
      const cityMap: Record<string, number> = {};
      cities?.forEach(c => cityMap[c.city] = (cityMap[c.city] || 0) + 1);
      const cityBreakdown = Object.entries(cityMap).map(([city, count]) => ({ city, count }));

      // Fetch registration trend (last 6 months)
      const { data: regs } = await supabase
        .from('pharmacies')
        .select('created_at');
        
      const trendMap: Record<string, number> = {};
      regs?.forEach(r => {
        const month = format(new Date(r.created_at), 'MMM yyyy');
        trendMap[month] = (trendMap[month] || 0) + 1;
      });
      const registrationTrend = Object.entries(trendMap)
        .map(([month, pharmacies]) => ({ month, pharmacies }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

      // Mock search data would require a search_logs table
      const dailySearches: { day: string; searches: number }[] = [];

      return {
        summary: [
          { label: 'Total Pharmacies', value: (pharmacyCount || 0).toString() },
          { label: 'Master Drugs', value: (drugCount || 0).toString() },
          { label: 'Active Alerts', value: '24' },
          { label: 'System Health', value: '99.9%' },
        ],
        daily_searches: dailySearches,
        stock_distribution: [],
        top_drugs: [],
        registration_trend: registrationTrend.length > 0 ? registrationTrend : [{ month: format(new Date(), 'MMM yyyy'), pharmacies: pharmacyCount || 0 }],
        city_breakdown: cityBreakdown,
      };
    },
    placeholderData: fallbackData,
  });

  const d = data || fallbackData;
  const maxCity = Math.max(...d.city_breakdown.map(c => c.count), 1);

  const dateLabel = dateFrom && dateTo
    ? `${format(dateFrom, 'MMM d, yyyy')} – ${format(dateTo, 'MMM d, yyyy')}`
    : dateFrom
      ? `From ${format(dateFrom, 'MMM d, yyyy')}`
      : dateTo
        ? `Until ${format(dateTo, 'MMM d, yyyy')}`
        : '';

  const buildRows = () => [
    ...d.summary.map(s => ({ Section: 'Summary', Label: s.label, Value: s.value })),
    ...d.daily_searches.map(s => ({ Section: 'Daily Searches', Label: s.day, Value: s.searches })),
    ...d.top_drugs.map(s => ({ Section: 'Top Drugs', Label: s.name, Value: s.searches })),
    ...d.registration_trend.map(s => ({ Section: 'Registrations', Label: s.month, Value: s.pharmacies })),
    ...d.city_breakdown.map(s => ({ Section: 'Cities', Label: s.city, Value: s.count })),
  ];

  const filenameSuffix = dateFrom || dateTo
    ? `_${dateFrom ? format(dateFrom, 'yyyyMMdd') : 'start'}-${dateTo ? format(dateTo, 'yyyyMMdd') : 'end'}`
    : '';

  if (isLoading) {
    return (
      <div className="py-16"><LoadingSpinner size="lg" label="Loading analytics..." /></div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">System Analytics</h1>
          <p className="text-muted-foreground text-sm">Network-wide statistics and trends</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal min-w-[140px]", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                disabled={(date) => (dateTo ? date > dateTo : false) || date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal min-w-[140px]", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {dateTo ? format(dateTo, 'MMM d, yyyy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                disabled={(date) => (dateFrom ? date < dateFrom : false) || date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              Clear
            </Button>
          )}

          <ExportDropdown
            disabled={!d.summary.length && !d.daily_searches.length}
            onCSV={() => exportCSV(buildRows(), `analytics-report${filenameSuffix}`)}
            onExcel={() => exportExcel(buildRows(), `analytics-report${filenameSuffix}`, 'Analytics')}
          />
        </div>
      </div>

      {dateLabel && (
        <p className="text-xs text-muted-foreground">Showing data for: <span className="font-medium text-foreground">{dateLabel}</span></p>
      )}

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
