import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportCSV, exportExcel } from '@/lib/adminExportUtils';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

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
  const { role, pharmacy } = useAuth();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null);

  // Determine effective pharmacy_id for scoping
  const effectivePharmacyId = role === 'super_admin' ? selectedPharmacyId : pharmacy?.id;

  const { data: pharmaciesList = [] } = useQuery({
    queryKey: ['admin', 'pharmacies_simple_list'],
    queryFn: async () => {
      const { items } = await api.pharmacies.list({ limit: 200 });
      return items.map((p) => ({ id: p.id, name: p.name }));
    },
    enabled: role === 'super_admin'
  });

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['admin', 'analytics', dateFrom?.toISOString(), dateTo?.toISOString(), effectivePharmacyId],
    queryFn: async () => {
      // One request. This replaced six browser-side queries plus
      // client-side bucketing: cities counted with a JS map, registrations
      // grouped by a formatted month string and then sorted by parsing
      // that string back into a Date, and stock health computed by pulling
      // every stock row and filtering it three times. All of it is SQL now.
      const overview = await api.admin.analyticsOverview({
        pharmacy_id: effectivePharmacyId || undefined,
      });

      const dist = overview.stock_distribution;
      const totalStock = dist.in_stock + dist.low_stock + dist.out_of_stock;
      const pct = (n: number) => (totalStock ? Math.round((n / totalStock) * 100) : 0);

      const stockDist = totalStock
        ? [
            { name: 'In Stock', value: pct(dist.in_stock), color: '#10b981' },
            { name: 'Low Stock', value: pct(dist.low_stock), color: '#f59e0b' },
            { name: 'Out of Stock', value: pct(dist.out_of_stock), color: '#ef4444' },
          ]
        : [];

      return {
        summary: [
          {
            label: effectivePharmacyId ? 'Inventory Items' : 'Total Pharmacies',
            value: String(effectivePharmacyId ? overview.inventory_count : overview.pharmacy_count),
          },
          { label: 'Inventory Items', value: String(overview.inventory_count) },
          { label: 'Stock Health', value: `${pct(dist.in_stock)}%` },
          // Was hardcoded to '99.9%'. Nothing measures uptime, so it now
          // reports the search volume it can actually account for.
          {
            label: 'Searches (30d)',
            value: String(overview.daily_searches.reduce((a, b) => a + Number(b.searches), 0)),
          },
        ],
        daily_searches: overview.daily_searches.map((row) => ({
          day: row.day,
          searches: Number(row.searches),
        })),
        stock_distribution: stockDist,
        top_drugs: overview.top_drugs.map((t) => ({
          name: t.name,
          searches: Number(t.searches),
        })),
        registration_trend: overview.registration_trend.length
          ? overview.registration_trend.map((r) => ({
              month: r.month,
              pharmacies: Number(r.pharmacies),
            }))
          : [{ month: format(new Date(), 'yyyy-MM'), pharmacies: 0 }],
        city_breakdown: overview.city_breakdown.map((c) => ({
          city: c.city,
          count: Number(c.count),
        })),
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
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">
            {effectivePharmacyId ? 'Pharmacy Analytics' : 'System Analytics'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {effectivePharmacyId ? 'Local inventory and staff trends' : 'Network-wide statistics and trends'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {role === 'super_admin' && (
            <div className="mr-2">
              <Select value={selectedPharmacyId || 'all'} onValueChange={(v) => setSelectedPharmacyId(v === 'all' ? null : v)}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="All Pharmacies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pharmacies</SelectItem>
                  {pharmaciesList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 200 : 250}>
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
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 200 : 250}>
                <PieChart>
                  <Pie 
                    data={d.stock_distribution} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={window.innerWidth < 640 ? 40 : 60} 
                    outerRadius={window.innerWidth < 640 ? 70 : 90} 
                    dataKey="value" 
                    label={window.innerWidth < 640 ? false : ({ name, value }) => `${name} ${value}%`}
                  >
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
            <CardHeader><CardTitle className="text-base">{effectivePharmacyId ? 'Highest Stock Items' : 'Top Drugs (Aggregated)'}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 300 : 250}>
                <BarChart data={d.top_drugs} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={window.innerWidth < 640 ? 70 : 100} />
                  <Tooltip />
                  <Bar dataKey="searches" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {d.registration_trend.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">{effectivePharmacyId ? 'Staff Registration Trend' : 'Pharmacy Registrations'}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 200 : 250}>
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
