import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';

const searchData = [
  { day: 'Mon', searches: 320 }, { day: 'Tue', searches: 410 },
  { day: 'Wed', searches: 380 }, { day: 'Thu', searches: 520 },
  { day: 'Fri', searches: 490 }, { day: 'Sat', searches: 280 },
  { day: 'Sun', searches: 190 },
];

const topDrugs = [
  { name: 'Paracetamol', searches: 892 },
  { name: 'Amoxicillin', searches: 654 },
  { name: 'Metformin', searches: 543 },
  { name: 'Omeprazole', searches: 421 },
  { name: 'Ciprofloxacin', searches: 398 },
  { name: 'Ibuprofen', searches: 356 },
];

const stockDistribution = [
  { name: 'In Stock', value: 68, color: 'hsl(142, 71%, 45%)' },
  { name: 'Low Stock', value: 22, color: 'hsl(38, 92%, 50%)' },
  { name: 'Out of Stock', value: 10, color: 'hsl(0, 84%, 60%)' },
];

const registrationTrend = [
  { month: 'Oct', pharmacies: 8 }, { month: 'Nov', pharmacies: 12 },
  { month: 'Dec', pharmacies: 15 }, { month: 'Jan', pharmacies: 19 },
  { month: 'Feb', pharmacies: 22 }, { month: 'Mar', pharmacies: 28 },
];

const cityBreakdown = [
  { city: 'Harare', count: 68 }, { city: 'Bulawayo', count: 34 },
  { city: 'Mutare', count: 22 }, { city: 'Gweru', count: 14 },
  { city: 'Other', count: 10 },
];

const AdminAnalyticsPage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">System Analytics</h1>
        <p className="text-muted-foreground text-sm">Network-wide statistics and trends</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Searches (7d)', value: '2,590' },
          { label: 'Active Pharmacies', value: '132' },
          { label: 'Avg. Search-to-Find', value: '1.8s' },
          { label: 'Network Stock Items', value: '18,420' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Search volume */}
        <Card>
          <CardHeader><CardTitle className="text-base">Daily Searches (This Week)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={searchData}>
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="searches" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Stock distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Stock Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stockDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                  {stockDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top searched drugs */}
        <Card>
          <CardHeader><CardTitle className="text-base">Most Searched Drugs</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topDrugs} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="searches" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Registration trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Pharmacy Registrations</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={registrationTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="pharmacies" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* City breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Pharmacies by City</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {cityBreakdown.map((c) => (
              <div key={c.city} className="flex items-center gap-3">
                <span className="text-sm w-20 text-foreground font-medium">{c.city}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/80 rounded-full transition-all" style={{ width: `${(c.count / 68) * 100}%` }} />
                </div>
                <span className="text-sm text-muted-foreground w-8 text-right">{c.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAnalyticsPage;
