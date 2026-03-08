import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, Users, Database, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';

const stats = [
  { label: 'Pending Approvals', value: '12', icon: CheckSquare, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { label: 'Total Pharmacies', value: '148', icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
  { label: 'Drugs in Database', value: '2,340', icon: Database, color: 'text-green-500', bg: 'bg-green-500/10' },
  { label: 'Searches Today', value: '1,892', icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { label: 'Stock Alerts', value: '34', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  { label: 'Growth (30d)', value: '+18%', icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10' },
];

const recentActivity = [
  { action: 'New pharmacy registration', detail: 'MedZim Pharmacy — Bulawayo', time: '5 min ago' },
  { action: 'Stock alert triggered', detail: 'Paracetamol 500mg — low stock across 8 pharmacies', time: '12 min ago' },
  { action: 'Pharmacy approved', detail: 'CareWell Pharmacy — Harare', time: '1 hour ago' },
  { action: 'Drug added', detail: 'Metformin 850mg — added to master database', time: '2 hours ago' },
  { action: 'Subscription upgrade', detail: 'ZimPharm Central upgraded to PRO', time: '3 hours ago' },
];

const AdminOverviewPage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm">System overview and quick actions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.bg} mb-2`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start justify-between py-3 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.action}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-4">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOverviewPage;
