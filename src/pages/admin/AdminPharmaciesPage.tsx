import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Store, MapPin, Phone, Trash2, Edit, RotateCcw, Eye, UserPlus, Ban, CheckCircle, CreditCard } from 'lucide-react';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportCSV, exportExcel } from '@/lib/adminExportUtils';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { requestDeletion } from '@/lib/lifecycleUtils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { api } from '@/lib/api';
import { createStaffUser } from '@/lib/adminAuthUtils';

interface PharmacyUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  suburb: string;
  address?: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  drug_count: number;
  joined: string;
}

type UserFormData = {
  name: string;
  email: string; // Pharmacy public email
  admin_email: string; // Admin account email
  phone: string;
  city: string;
  suburb: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  password?: string;
  admin_name?: string;
  address?: string;
};

const emptyForm: UserFormData = {
  name: '',
  email: '',
  admin_email: '',
  phone: '',
  city: 'Harare',
  suburb: '',
  status: 'PENDING',
  plan_tier: 'FREE',
  password: '',
  admin_name: '',
  address: '',
};

const cities = ['Harare', 'Bulawayo', 'Mutare', 'Gweru'];

const AdminPharmaciesPage = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');

  // CRUD dialogs
  const [viewUser, setViewUser] = useState<PharmacyUser | null>(null);
  const [editUser, setEditUser] = useState<PharmacyUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<PharmacyUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [changePlanUser, setChangePlanUser] = useState<PharmacyUser | null>(null);
  const [newPlan, setNewPlan] = useState('');

  const { data: users = [], isLoading } = useQuery<PharmacyUser[]>({
    queryKey: ['admin', 'pharmacies', statusFilter, planFilter],
    queryFn: async () => {
      // drug_count is counted per pharmacy in SQL. This previously
      // downloaded every pharmacy_stock row in the system on each load
      // just to tally them by pharmacy_id in the browser.
      const { items } = await api.pharmacies.list({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit: 200,
      });

      return items
        .filter((p: any) => planFilter === 'ALL' || p.plan_tier === planFilter)
        .map((p: any) => ({ ...p, drug_count: p.drug_count ?? 0, joined: p.created_at })) as PharmacyUser[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, name, email }: { id: string; status: string; name: string; email: string }) => {
      // Audited server-side inside the same request.
      await api.admin.setPharmacyStatus(id, status);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'pharmacies'] });
      const previous = queryClient.getQueryData(['admin', 'pharmacies']);
      queryClient.setQueryData(['admin', 'pharmacies'], (old: PharmacyUser[] | undefined) => 
        old?.map(p => p.id === vars.id ? { ...p, status: vars.status as any } : p)
      );
      return { previous };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      toast.success(`Pharmacy ${vars.status.toLowerCase()} successfully`);
    },
    onError: (err: any, vars, context: any) => {
      if (context?.previous) queryClient.setQueryData(['admin', 'pharmacies'], context.previous);
      toast.error(err.message || 'Failed to update status');
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, plan_tier }: { id: string; plan_tier: string }) => {
      await api.admin.setPharmacyPlan(id, plan_tier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      toast.success(`Plan changed to ${newPlan}`);
      setChangePlanUser(null);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to change plan'),
  });

  const createMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      if (!data.name || !data.admin_email || !data.password || !data.admin_name || !data.city || !data.suburb || !data.phone) {
         throw new Error("Pharmacy Name, Admin Email, Admin Name, Password, City, Suburb, and Phone are all required.");
      }

      // Pharmacy and its first admin are created in one transaction. Done
      // as two calls, a failure on the second left an orphaned pharmacy
      // that nobody could sign in to manage.
      await api.admin.createPharmacy({
        name: data.name,
        email: data.email || data.admin_email,
        phone: data.phone,
        city: data.city,
        suburb: data.suburb,
        address: data.address,
        status: data.status,
        plan_tier: data.plan_tier,
        admin: {
          email: data.admin_email,
          password: data.password,
          full_name: data.admin_name,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      toast.success('Pharmacy and Admin User created successfully');
      setShowCreate(false);
      setFormData(emptyForm);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to create pharmacy'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserFormData> }) => {
      // status and plan_tier are privileged and have their own endpoints;
      // they are not accepted here, so this cannot approve a pharmacy or
      // upgrade its plan as a side effect of an edit.
      await api.pharmacies.update(id, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        city: data.city,
        suburb: data.suburb,
        address: data.address,
      } as any);
      if (data.status) await api.admin.setPharmacyStatus(id, data.status);
      if (data.plan_tier) await api.admin.setPharmacyPlan(id, data.plan_tier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      toast.success('User updated successfully');
      setEditUser(null);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update user'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
       await api.admin.trashPharmacy(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      queryClient.invalidateQueries({ queryKey: ['system', 'trash'] });
      toast.success('Pharmacy moved to system trash (48h retention).');
      setDeleteUser(null);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to trash pharmacy'),
  });

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination<PharmacyUser>(filtered, { defaultPageSize: 10 });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Active</Badge>;
      case 'SUSPENDED': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Suspended</Badge>;
      case 'REJECTED': return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">Rejected</Badge>;
      case 'PENDING': return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-xs">Pending</Badge>;
      default: return null;
    }
  };

  const planBadge = (plan: string) => {
    const colors: Record<string, string> = { FREE: 'bg-muted text-muted-foreground', BASIC: 'bg-blue-500/10 text-blue-600', PRO: 'bg-primary/10 text-primary' };
    return <Badge variant="outline" className={`${colors[plan] || ''} text-xs`}>{plan}</Badge>;
  };

  const openEdit = (u: PharmacyUser) => {
    setEditUser(u);
    setFormData({ ...emptyForm, name: u.name, email: u.email, phone: u.phone, city: u.city, suburb: u.suburb, status: u.status, plan_tier: u.plan_tier });
  };

  const openCreate = () => {
    setFormData(emptyForm);
    setShowCreate(true);
  };

  const renderFormFields = (isCreate: boolean) => (
    <div className="space-y-4 overflow-y-auto max-h-[60vh] px-2 py-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Pharmacy Name *</Label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. HealthPlus Pharmacy" />
        </div>
        <div className="space-y-2">
          <Label>Pharmacy Public Email (Optional)</Label>
          <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="pharmacy@example.com" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>City / Town *</Label>
          <Input list="city-list" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="e.g. Harare" />
          <datalist id="city-list">
            {cities.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label>Suburb *</Label>
          <Input value={formData.suburb} onChange={(e) => setFormData({ ...formData, suburb: e.target.value })} placeholder="e.g. Avondale" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Street Address</Label>
        <Input value={formData.address || ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Samora Machel Ave" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as UserFormData['status'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Plan Tier</Label>
          <Select value={formData.plan_tier} onValueChange={(v) => setFormData({ ...formData, plan_tier: v as UserFormData['plan_tier'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="BASIC">Basic — $29/mo</SelectItem>
              <SelectItem value="PRO">Pro — $79/mo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Phone *</Label>
          <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="0771 234 567" />
        </div>
      </div>
      {isCreate && (
        <div className="border-t border-border pt-4 mt-2">
          <h4 className="font-medium text-sm mb-3">Admin Account Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Admin Name *</Label>
              <Input value={formData.admin_name || ''} onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Admin Email *</Label>
              <Input type="email" value={formData.admin_email || ''} onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })} placeholder="admin@example.com" />
            </div>
          </div>
          <div className="mt-4">
            <Label>Admin Password *</Label>
            <Input type="password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Min 6 characters" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">This will create the primary administrative login for this pharmacy.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Pharmacy Management</h1>
          <p className="text-muted-foreground text-sm">{users.length} registered pharmacies</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreate}>
            <UserPlus className="w-4 h-4 mr-1.5" /> Add Pharmacy
          </Button>
          <ExportDropdown
            disabled={!filtered.length}
            onCSV={() => exportCSV(filtered.map(u => ({ Name: u.name, Email: u.email, Phone: u.phone, City: u.city, Suburb: u.suburb, Status: u.status, Plan: u.plan_tier, 'Drug Count': u.drug_count, Joined: u.joined })), 'user-list')}
            onExcel={() => exportExcel(filtered.map(u => ({ Name: u.name, Email: u.email, Phone: u.phone, City: u.city, Suburb: u.suburb, Status: u.status, Plan: u.plan_tier, 'Drug Count': u.drug_count, Joined: u.joined })), 'user-list', 'Users')}
          />
        </div>
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
            <SelectItem value="REJECTED">Rejected</SelectItem>
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
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => setViewUser(u)} title="View">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)} title="Edit">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteUser(u)} title="Delete" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setChangePlanUser(u); setNewPlan(u.plan_tier); }}>
                      <CreditCard className="w-3.5 h-3.5 mr-1" /> Plan
                    </Button>
                    {u.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: u.id, status: 'APPROVED', name: u.name, email: u.email })}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: u.id, status: 'REJECTED', name: u.name, email: u.email })}
                        >
                          <Ban className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {u.status !== 'PENDING' && (
                      <Button
                        size="sm"
                        variant={u.status === 'SUSPENDED' ? 'default' : 'outline'}
                        disabled={updateStatusMutation.isPending}
                        onClick={() => updateStatusMutation.mutate({ 
                          id: u.id, 
                          status: u.status === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED',
                          name: u.name,
                          email: u.email
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

      {/* View User Dialog */}
      <Dialog open={!!viewUser} onOpenChange={() => setViewUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Full information for this pharmacy account</DialogDescription>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-y-2.5">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium text-foreground">{viewUser.name}</span>
                <span className="text-muted-foreground">Email</span>
                <span className="text-foreground">{viewUser.email}</span>
                <span className="text-muted-foreground">Phone</span>
                <span className="text-foreground">{viewUser.phone || '—'}</span>
                <span className="text-muted-foreground">City</span>
                <span className="text-foreground">{viewUser.city}</span>
                <span className="text-muted-foreground">Suburb</span>
                <span className="text-foreground">{viewUser.suburb || '—'}</span>
                <span className="text-muted-foreground">Status</span>
                <span>{statusBadge(viewUser.status)}</span>
                <span className="text-muted-foreground">Plan</span>
                <span>{planBadge(viewUser.plan_tier)}</span>
                <span className="text-muted-foreground">Drugs Listed</span>
                <span className="text-foreground">{viewUser.drug_count}</span>
                <span className="text-muted-foreground">Joined</span>
                <span className="text-foreground">{new Date(viewUser.joined).toLocaleDateString()}</span>
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs text-muted-foreground">{viewUser.id}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewUser(null)}>Close</Button>
            <Button onClick={() => { if (viewUser) openEdit(viewUser); setViewUser(null); }}>
              <Edit className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> Create New User</DialogTitle>
            <DialogDescription>Add a new pharmacy account to the system</DialogDescription>
          </DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={createMutation.isPending || !formData.name || !formData.admin_email || !formData.admin_name || !formData.password} onClick={() => createMutation.mutate(formData)}>
              {createMutation.isPending ? 'Creating...' : 'Create Pharmacy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit className="w-5 h-5" /> Edit User</DialogTitle>
            <DialogDescription>Update pharmacy account details</DialogDescription>
          </DialogHeader>
          {renderFormFields(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button disabled={updateMutation.isPending || !formData.name} onClick={() => editUser && updateMutation.mutate({ id: editUser.id, data: formData })}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteUser?.name}</strong> ({deleteUser?.email})? This action cannot be undone and will remove all associated stock data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

export default AdminPharmaciesPage;
