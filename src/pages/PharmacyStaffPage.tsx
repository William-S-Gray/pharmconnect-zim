import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, UserCog, Trash2, Mail } from 'lucide-react';
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
  joined: string;
};

type StaffFormData = {
  full_name: string;
  email: string;
  password?: string;
  role: UserRole;
};

const emptyForm: StaffFormData = {
  full_name: '',
  email: '',
  role: 'pharmacy_staff',
};

const PharmacyStaffPage = () => {
  const queryClient = useQueryClient();
  const { pharmacy, role } = useAuth();
  const [search, setSearch] = useState('');
  
  const [showCreate, setShowCreate] = useState(false);
  const [deleteUser, setDeleteUser] = useState<StaffMember | null>(null);
  const [formData, setFormData] = useState<StaffFormData>(emptyForm);

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ['pharmacy', 'staff', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return [];
      
      // Step 1: fetch memberships for this pharmacy
      // One request. This replaced a two-step client-side join: fetch the
      // memberships, collect the user ids, batch-fetch the profiles, then
      // merge them with a lookup map in the browser.
      const roster = await api.pharmacies.staff(pharmacy.id);

      return roster.map((m: any) => ({
        id: m.id,
        email: m.email ?? '',
        full_name: m.full_name ?? '',
        global_role: m.global_role as UserRole,
        membership_role: m.role as UserRole,
        joined: m.joined_at,
      }));
    },
    enabled: !!pharmacy?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: StaffFormData) => {
      if (!data.password) throw new Error("Password is required for new users.");
      if (!pharmacy?.id) throw new Error("No pharmacy context.");
      // Admin limits creation to staff only for their pharmacy
      await createStaffUser(data.email, data.password, data.full_name, 'pharmacy_staff', pharmacy.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'staff'] });
      toast.success('Staff team member added successfully');
      setShowCreate(false);
      setFormData(emptyForm);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to add staff'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
       await requestDeletion('profiles', id, 'Staff tenure ended / Manual removal', pharmacy?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'staff'] });
      toast.success('Deletion request submitted to admin for approval.');
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
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination<StaffMember>(filtered, { defaultPageSize: 10 });

  if (role !== 'pharmacy_admin') {
     return <div className="p-8 text-center text-muted-foreground">You do not have permission to view staff management.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Staff Management</h1>
          <p className="text-muted-foreground text-sm">Manage personnel access for {pharmacy?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setFormData(emptyForm); setShowCreate(true); }}>
            <UserCog className="w-4 h-4 mr-1.5" /> Add Staff Member
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search staff members..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="py-8"><LoadingSpinner size="lg" label="Loading staff personnel..." /></div>
      ) : (
        <div className="space-y-3">
          {pagination.paginatedItems.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-heading font-semibold text-foreground">{u.full_name || 'Unnamed Staff'}</h3>
                      <Badge variant="outline" className={u.membership_role === 'pharmacy_admin' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground'}>
                        {u.membership_role === 'pharmacy_admin' ? 'Admin' : 'Staff'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                      <span>Joined {new Date(u.joined).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    <Button
                      size="sm" variant="outline"
                      disabled={resetPasswordMutation.isPending}
                      onClick={() => u.email && resetPasswordMutation.mutate(u.email)}
                    >
                      Reset Password
                    </Button>
                    {u.membership_role !== 'pharmacy_admin' && (
                      <Button size="sm" variant="ghost" onClick={() => setDeleteUser(u)} title="Revoke Access" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4 mr-1.5" /> Remove
                      </Button>
                    )}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>Create a new staff login for {pharmacy?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
             <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="jane@pharmacy.com" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <Input type="password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Min 6 chars" autoComplete="new-password" />
                <p className="text-xs text-muted-foreground pt-1">They can change this password later via the login page.</p>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={createMutation.isPending || !formData.email || !formData.password} onClick={() => createMutation.mutate(formData)}>
              {createMutation.isPending ? 'Validating...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteUser?.full_name}</strong> from your pharmacy? They will be signed out and lose all dashboard access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}>
                {deleteMutation.isPending ? 'Removing...' : 'Remove User'}
             </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PharmacyStaffPage;
