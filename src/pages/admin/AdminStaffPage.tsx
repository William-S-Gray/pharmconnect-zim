import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, UserCog, Pencil, Trash2, Shield, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { createStaffUser, sendPasswordResetEmail } from '@/lib/adminAuthUtils';
import { requestDeletion } from '@/lib/lifecycleUtils';
import { useAuth, UserRole } from '@/context/AuthContext';

type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  global_role: UserRole;
  membership_role: UserRole;
  pharmacy_id: string;
  pharmacy_name: string;
  joined: string;
};

type StaffFormData = {
  full_name: string;
  email: string;
  password?: string;
  role: UserRole;
  pharmacy_id: string;
};

const emptyForm: StaffFormData = {
  full_name: '',
  email: '',
  role: 'pharmacy_staff',
  pharmacy_id: '',
};

const AdminStaffPage = () => {
  const queryClient = useQueryClient();
  const { pharmacy } = useAuth();
  const [search, setSearch] = useState('');
  
  const [showCreate, setShowCreate] = useState(false);
  const [deleteUser, setDeleteUser] = useState<StaffMember | null>(null);
  const [formData, setFormData] = useState<StaffFormData>(emptyForm);

  const { data: pharmacies = [] } = useQuery({
    queryKey: ['admin', 'pharmacies_list'],
    queryFn: async () => {
      const { items } = await api.pharmacies.list({ limit: 200 });
      return items.map((p) => ({ id: p.id, name: p.name }));
    }
  });

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ['admin', 'staff'],
    queryFn: async () => {
      // One request. This replaced a five-step client-side join: fetch
      // every membership, collect the ids, batch-fetch profiles, batch-fetch
      // pharmacies, then merge with lookup maps in the browser. The
      // endpoint aggregates memberships per user in SQL.
      const { items } = await api.admin.users({ limit: 200 });

      return items.flatMap((u: any) =>
        (u.memberships ?? []).map((m: any) => ({
          id: u.id,
          email: u.email ?? '',
          full_name: u.full_name ?? '',
          global_role: u.global_role as UserRole,
          membership_role: m.role as UserRole,
          pharmacy_id: m.pharmacy_id,
          pharmacy_name: m.name || 'Unknown',
          joined: u.created_at,
        })),
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: StaffFormData) => {
      if (!data.password) throw new Error("Password is required for new users.");
      if (!data.pharmacy_id) throw new Error("A pharmacy must be assigned.");
      await createStaffUser(data.email, data.password, data.full_name, data.role, data.pharmacy_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
      toast.success('Staff user created successfully');
      setShowCreate(false);
      setFormData(emptyForm);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to create staff'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
       // Now using Lifecycle Management: Normal users request, Admins approve.
       // Even for Super Admin, we move to Trash instead of Hard Delete.
       await requestDeletion('profiles', id, 'Administrative revocation of access', pharmacy?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
      toast.success('Deletion request submitted to system queue.');
      setDeleteUser(null);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to submit request'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      await sendPasswordResetEmail(email);
    },
    onSuccess: (_, email) => toast.success(`Password reset email sent to ${email}`),
    onError: (error: any) => toast.error(error.message || 'Failed to send reset email'),
  });

  const filtered = staffList.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.pharmacy_name?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination<StaffMember>(filtered, { defaultPageSize: 10 });

  const roleText = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'pharmacy_admin': return 'Pharmacy Admin';
      case 'pharmacy_staff': return 'Staff';
      default: return role;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Staff Management</h1>
          <p className="text-muted-foreground text-sm">{staffList.length} staff members across pharmacies</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setFormData(emptyForm); setShowCreate(true); }}>
            <UserCog className="w-4 h-4 mr-1.5" /> Add Staff Profile
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search staff or pharmacy..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="py-8"><LoadingSpinner size="lg" label="Loading staff..." /></div>
      ) : (
        <div className="space-y-3">
          {pagination.paginatedItems.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-heading font-semibold text-foreground">{u.full_name || 'Unnamed User'}</h3>
                      <Badge variant="outline" className={u.membership_role === 'pharmacy_admin' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground'}>
                        {roleText(u.membership_role)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{u.email}</span>
                      <span className="flex items-center gap-1"><Store className="w-3 h-3" /> {u.pharmacy_name}</span>
                      <span>Joined {new Date(u.joined).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    <Button
                      size="sm" variant="outline"
                      disabled={resetPasswordMutation.isPending}
                      onClick={() => u.email && resetPasswordMutation.mutate(u.email)}
                      title="Send Password Reset Email"
                    >
                      Send Reset
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteUser(u)} title="Revoke Access" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No staff members found.</CardContent></Card>
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

      {/* Create Staff Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Staff User</DialogTitle>
            <DialogDescription>Add a new user and map them securely to a pharmacy</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="john@pharmacy.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Temporary Password</Label>
                  <Input type="password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Min 6 chars" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pharmacy_staff">Staff User</SelectItem>
                      <SelectItem value="pharmacy_admin">Pharmacy Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                 <Label>Assigned Pharmacy</Label>
                 <Select value={formData.pharmacy_id} onValueChange={(v) => setFormData({ ...formData, pharmacy_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Pharmacy..." /></SelectTrigger>
                    <SelectContent>
                      {pharmacies.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={createMutation.isPending || !formData.email || !formData.pharmacy_id || !formData.password} onClick={() => createMutation.mutate(formData)}>
              {createMutation.isPending ? 'Inviting...' : 'Create Staff'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Pharmacy Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to decouple <strong>{deleteUser?.full_name}</strong> from {deleteUser?.pharmacy_name}? They will no longer be able to log in to this pharmacy's dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}>
                {deleteMutation.isPending ? 'Revoking...' : 'Revoke Access'}
             </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminStaffPage;
