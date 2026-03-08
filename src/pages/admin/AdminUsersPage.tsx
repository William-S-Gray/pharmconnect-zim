import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Ban, CheckCircle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface PharmacyUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  suburb: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  drug_count: number;
  joined: string;
}

const mockUsers: PharmacyUser[] = [
  { id: 'u1', name: 'HealthPlus Pharmacy', email: 'healthplus@mail.co.zw', phone: '0771 234 567', city: 'Harare', suburb: 'Avondale', status: 'APPROVED', plan_tier: 'PRO', drug_count: 312, joined: '2025-08-15' },
  { id: 'u2', name: 'ZimPharm Central', email: 'zimpharm@mail.co.zw', phone: '0772 345 678', city: 'Harare', suburb: 'CBD', status: 'APPROVED', plan_tier: 'BASIC', drug_count: 189, joined: '2025-09-20' },
  { id: 'u3', name: 'CareWell Pharmacy', email: 'carewell@mail.co.zw', phone: '0773 456 789', city: 'Harare', suburb: 'Borrowdale', status: 'APPROVED', plan_tier: 'FREE', drug_count: 67, joined: '2025-11-02' },
  { id: 'u4', name: 'MedZim Pharmacy', email: 'medzim@mail.co.zw', phone: '0774 567 890', city: 'Bulawayo', suburb: 'City Centre', status: 'SUSPENDED', plan_tier: 'BASIC', drug_count: 0, joined: '2025-10-10' },
  { id: 'u5', name: 'Sunrise Health', email: 'sunrise@mail.co.zw', phone: '0775 678 901', city: 'Mutare', suburb: 'Main Street', status: 'APPROVED', plan_tier: 'PRO', drug_count: 456, joined: '2025-07-01' },
  { id: 'u6', name: 'QuickMeds', email: 'quickmeds@mail.co.zw', phone: '0776 789 012', city: 'Gweru', suburb: 'Mkoba', status: 'PENDING', plan_tier: 'FREE', drug_count: 0, joined: '2026-03-04' },
];

const AdminUsersPage = () => {
  const [users, setUsers] = useState(mockUsers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [changePlanUser, setChangePlanUser] = useState<PharmacyUser | null>(null);
  const [newPlan, setNewPlan] = useState<string>('');

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const next = currentStatus === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED';
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: next as 'APPROVED' | 'SUSPENDED' } : u));
    toast.success(`Pharmacy ${next === 'SUSPENDED' ? 'suspended' : 'reactivated'}`);
  };

  const handleChangePlan = () => {
    if (!changePlanUser || !newPlan) return;
    setUsers(prev => prev.map(u => u.id === changePlanUser.id ? { ...u, plan_tier: newPlan as 'FREE' | 'BASIC' | 'PRO' } : u));
    toast.success(`Plan changed to ${newPlan}`);
    setChangePlanUser(null);
  };

  const filtered = users.filter(u => {
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    const matchesPlan = planFilter === 'ALL' || u.plan_tier === planFilter;
    const matchesSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesPlan && matchesSearch;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Active</Badge>;
      case 'SUSPENDED': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Suspended</Badge>;
      case 'PENDING': return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-xs">Pending</Badge>;
      default: return null;
    }
  };

  const planBadge = (plan: string) => {
    const colors: Record<string, string> = { FREE: 'bg-muted text-muted-foreground', BASIC: 'bg-blue-500/10 text-blue-600', PRO: 'bg-primary/10 text-primary' };
    return <Badge variant="outline" className={`${colors[plan] || ''} text-xs`}>{plan}</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">User Management</h1>
        <p className="text-muted-foreground text-sm">{users.length} registered pharmacies</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="APPROVED">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Plans</SelectItem>
            <SelectItem value="FREE">Free</SelectItem>
            <SelectItem value="BASIC">Basic</SelectItem>
            <SelectItem value="PRO">Pro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map((u) => (
          <Card key={u.id}>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-heading font-semibold text-foreground">{u.name}</h3>
                    {statusBadge(u.status)}
                    {planBadge(u.plan_tier)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{u.email}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {u.suburb}, {u.city}</span>
                    <span>{u.drug_count} drugs listed</span>
                    <span>Joined {new Date(u.joined).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => { setChangePlanUser(u); setNewPlan(u.plan_tier); }}>
                    <CreditCard className="w-3.5 h-3.5 mr-1" /> Plan
                  </Button>
                  {u.status !== 'PENDING' && (
                    <Button
                      size="sm"
                      variant={u.status === 'SUSPENDED' ? 'default' : 'destructive'}
                      onClick={() => handleToggleStatus(u.id, u.status)}
                    >
                      {u.status === 'SUSPENDED' ? <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Reactivate</> : <><Ban className="w-3.5 h-3.5 mr-1" /> Suspend</>}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No users match your filter.</CardContent></Card>
        )}
      </div>

      {/* Change Plan Dialog */}
      <Dialog open={!!changePlanUser} onOpenChange={() => setChangePlanUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Plan — {changePlanUser?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Select Plan</Label>
            <Select value={newPlan} onValueChange={setNewPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FREE">Free — $0/mo</SelectItem>
                <SelectItem value="BASIC">Basic — $29/mo</SelectItem>
                <SelectItem value="PRO">Pro — $79/mo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanUser(null)}>Cancel</Button>
            <Button onClick={handleChangePlan}>Update Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;
