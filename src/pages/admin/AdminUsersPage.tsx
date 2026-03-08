import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Ban, CheckCircle, CreditCard } from 'lucide-react';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportCSV, exportExcel } from '@/lib/adminExportUtils';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';

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

const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [changePlanUser, setChangePlanUser] = useState<PharmacyUser | null>(null);
  const [newPlan, setNewPlan] = useState('');

  const { data: users = [], isLoading } = useQuery<PharmacyUser[]>({
    queryKey: ['admin', 'users', statusFilter, planFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (planFilter !== 'ALL') params.plan_tier = planFilter;
      const res = await api.get('/api/admin/users', { params });
      return res.data;
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/api/admin/users/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(`Pharmacy ${vars.status === 'SUSPENDED' ? 'suspended' : 'reactivated'}`);
    },
    onError: () => toast.error('Failed to update status'),
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ id, plan_tier }: { id: string; plan_tier: string }) =>
      api.put(`/api/admin/users/${id}/plan`, { plan_tier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(`Plan changed to ${newPlan}`);
      setChangePlanUser(null);
    },
    onError: () => toast.error('Failed to change plan'),
  });

  const filtered = users.filter(u => {
    return !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
  });

  const pagination = usePagination(filtered, { defaultPageSize: 10 });

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">User Management</h1>
          <p className="text-muted-foreground text-sm">{users.length} registered pharmacies</p>
        </div>
        <ExportDropdown
          disabled={!filtered.length}
          onCSV={() => exportCSV(filtered.map(u => ({ Name: u.name, Email: u.email, Phone: u.phone, City: u.city, Suburb: u.suburb, Status: u.status, Plan: u.plan_tier, 'Drug Count': u.drug_count, Joined: u.joined })), 'user-list')}
          onExcel={() => exportExcel(filtered.map(u => ({ Name: u.name, Email: u.email, Phone: u.phone, City: u.city, Suburb: u.suburb, Status: u.status, Plan: u.plan_tier, 'Drug Count': u.drug_count, Joined: u.joined })), 'user-list', 'Users')}
        />
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

      {isLoading ? (
        <div className="py-8"><LoadingSpinner size="lg" label="Loading users..." /></div>
      ) : (
        <div className="space-y-3">
          {pagination.paginatedItems.map((u) => (
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
                        disabled={toggleStatusMutation.isPending}
                        onClick={() => toggleStatusMutation.mutate({
                          id: u.id,
                          status: u.status === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED',
                        })}
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
          <PaginationControls
            page={pagination.page} totalPages={pagination.totalPages}
            canPrev={pagination.canPrev} canNext={pagination.canNext}
            onPrev={pagination.prevPage} onNext={pagination.nextPage}
            onPageChange={pagination.setPage}
            startIndex={pagination.startIndex} endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize} onPageSizeChange={pagination.setPageSize}
          />
        </div>
      )}

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
            <Button disabled={changePlanMutation.isPending} onClick={() => changePlanUser && changePlanMutation.mutate({ id: changePlanUser.id, plan_tier: newPlan })}>
              {changePlanMutation.isPending ? 'Updating...' : 'Update Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;
