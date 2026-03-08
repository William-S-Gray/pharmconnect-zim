import { BarChart3, Package, AlertTriangle, CreditCard, TrendingUp } from 'lucide-react';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const stats = [
  { label: 'Searches this month', value: '847', icon: BarChart3, color: 'text-primary' },
  { label: 'Drugs Listed', value: '23', icon: Package, color: 'text-primary' },
  { label: 'Low Stock Items', value: '5', icon: AlertTriangle, color: 'text-warning' },
  { label: 'Current Plan', value: 'BASIC', icon: CreditCard, color: 'text-accent' },
];

const lowStockItems = [
  { drug: 'Metformin 500mg', quantity: 8, threshold: 10 },
  { drug: 'Amoxil 500mg', quantity: 5, threshold: 10 },
  { drug: 'Panadol 500mg', quantity: 3, threshold: 20 },
];

const topSearches = [
  { drug: 'Metformin 500mg', count: 124 },
  { drug: 'Panadol 500mg', count: 89 },
  { drug: 'Amoxicillin 500mg', count: 67 },
];

const PharmacyDashboard = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground">Good morning, Halsteads Pharmacy 👋</h1>
        <p className="text-muted-foreground text-sm">Here's your overview for today</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-center gap-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <span className="font-heading font-bold text-2xl text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Low stock */}
        <div className="card-pharma">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-foreground">Low Stock Alerts</h2>
            <Link to="/dashboard/stock" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {lowStockItems.map((item) => (
              <div key={item.drug} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-mono-drug text-sm font-medium text-foreground">{item.drug}</p>
                  <p className="text-xs text-muted-foreground">{item.quantity} left · threshold: {item.threshold}</p>
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
            {topSearches.map((item, i) => (
              <div key={item.drug} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="font-mono-drug text-sm font-medium text-foreground">{item.drug}</span>
                </div>
                <span className="text-sm text-muted-foreground">{item.count} searches</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade banner */}
      <div className="card-pharma bg-primary/5 border-primary/20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading font-semibold text-foreground">You were searched 847 times this month</h3>
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
