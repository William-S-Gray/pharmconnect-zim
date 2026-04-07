import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, UserCog, Edit, Trash2, Shield, Store, UserPlus, Mail, ArrowDownCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { createStaffUser, sendPasswordResetEmail } from '@/lib/adminAuthUtils';
import { requestDeletion } from '@/lib/lifecycleUtils';
import { useAuth, UserRole } from '@/context/AuthContext';

type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  global_role: UserRole;
  membership_role: UserRole;
  pharmacy_id: string;
  pharmacy_name: string;
  lifecycle_status: 'ACTIVE' | 'PENDING_DELETE' | 'TRASHED';
  joined: string;
};

const UserManagementPage = () => {
  const queryClient = useQueryClient();
  const { pharmacy, role: myRole } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [pharmacyFilter, setPharmacyFilter] = useState<string>('all');
  
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);
  const [demoteUser, setDemoteUser] = useState<ManagedUser | null>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'pharmacy_staff' as UserRole,
    pharmacy_id: '',
  });

  // Fetch pharmacies for filtering and assignment
  const { data: pharmacies = [] } = useQuery({
    queryKey: ['admin', 'pharmacies_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pharmacies').select('id, name').order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: users = [], isLoading } = useQuery<ManagedUser[]>({
    queryKey: ['admin', 'users_management'],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select(`
          id, email, full_name, global_role, lifecycle_status, created_at,
          memberships (role, pharmacy_id, pharmacies (name))
        `);

      if (myRole === 'admin' && pharmacy?.id) {
        // Scoped to pharmacy members
        const { data: members } = await supabase.from('memberships').select('user_id').eq('pharmacy_id', pharmacy.id);
        const ids = members?.map(m => m.user_id) || [];
        query = query.in('id', ids);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((u: any) => {
        const primaryMem = u.memberships?.[0] || {};
        return {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          global_role: u.global_role,
          membership_role: primaryMem.role,
          pharmacy_id: primaryMem.pharmacy_id,
          pharmacy_name: primaryMem.pharmacies?.name || 'No Pharmacy',
          lifecycle_status: u.lifecycle_status,
          joined: u.created_at,
        };
      });
    }
  });

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(search.toLowerCase()) || 
                          u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.global_role === roleFilter;
    const matchesPharm = pharmacyFilter === 'all' || u.pharmacy_id === pharmacyFilter;
    return matchesSearch && matchesRole && matchesPharm;
  });

  const pagination = usePagination(filteredUsers, { defaultPageSize: 10 });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const pId = myRole === 'admin' ? pharmacy?.id : data.pharmacy_id;
      if (!pId) throw new Error('Pharmacy selection required');
      return createStaffUser(data.email, data.password, data.full_name, data.role, pId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users_management'] });
      toast.success('User account created successfully');
      setShowCreate(false);
      setFormData({ full_name: '', email: '', password: '', role: 'pharmacy_staff', pharmacy_id: '' });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ManagedUser>) => {
      const { id, full_name, global_role, membership_role } = data;
      
      // Update profile
      const { error: pError } = await supabase.from('profiles').update({ full_name, global_role }).eq('id', id);
      if (pError) throw pError;

      // Update membership role if applicable
      if (membership_role) {
        const { error: mError } = await supabase.from('memberships').update({ role: membership_role }).eq('user_id', id);
        if (mError) throw mError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users_management'] });
      toast.success('User updated successfully');
      setEditUser(null);
    },
    onError: (err: any) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (user: ManagedUser) => {
      return requestDeletion('profiles', user.id, 'Administrative removal', user.pharmacy_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users_management'] });
      toast.success('Deletion request submitted to trash');
      setDeleteUser(null);
    }
  });

  const handleDemote = () => {
    if (!demoteUser) return;
    updateMutation.mutate({ 
      id: demoteUser.id, 
      global_role: 'pharmacy_staff', 
      membership_role: 'pharmacy_staff' 
    });
    setDemoteUser(null);
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(email);
      toast.success('Password reset email sent');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isLoading) return <div className="py-12"><LoadingSpinner size="lg" label="Loading user directory..." /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">User Management</h1>
          <p className="text-muted-foreground text-sm">Manage system access, roles, and permissions</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="skeu-button flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add New User
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search by name or email..." 
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-10 skeu-inset">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="admin">Pharmacy Admin</SelectItem>
            <SelectItem value="pharmacy_staff">Pharmacy Staff</SelectItem>
          </SelectContent>
        </Select>
        <div className={cn("contents", myRole !== 'super_admin' && "hidden")}>
          <Select value={pharmacyFilter} onValueChange={setPharmacyFilter}>
            <SelectTrigger className="h-10 skeu-inset">
              <SelectValue placeholder="All Pharmacies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pharmacies</SelectItem>
              {pharmacies.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block skeu-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="p-4 font-semibold text-muted-foreground">User</th>
                <th className="p-4 font-semibold text-muted-foreground whitespace-nowrap">Global Role</th>
                <th className="p-4 font-semibold text-muted-foreground whitespace-nowrap">Pharmacy Role</th>
                <th className="p-4 font-semibold text-muted-foreground">Pharmacy</th>
                <th className="p-4 font-semibold text-muted-foreground">Status</th>
                <th className="p-4 font-semibold text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagination.paginatedItems.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-foreground">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {u.email}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <Badge variant={u.global_role === 'super_admin' ? 'default' : 'secondary'} className="capitalize">
                      {u.global_role.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="p-4 capitalize">{u.membership_role.replace('_', ' ')}</td>
                  <td className="p-4 text-muted-foreground">{u.pharmacy_name}</td>
                  <td className="p-4">
                    <Badge 
                      variant={u.lifecycle_status === 'ACTIVE' ? 'outline' : 'destructive'} 
                      className={u.lifecycle_status === 'ACTIVE' ? 'border-green-500 text-green-600' : ''}
                    >
                      {u.lifecycle_status}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditUser(u)}>
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>
                      {(u.global_role === 'admin' || u.membership_role === 'admin') && (
                        <Button variant="ghost" size="icon" title="Demote to Staff" onClick={() => setDemoteUser(u)}>
                          <ArrowDownCircle className="w-4 h-4 text-amber-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => resetPassword(u.email)}>
                        <Shield className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteUser(u)} disabled={u.lifecycle_status !== 'ACTIVE'}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {pagination.paginatedItems.map((u) => (
          <Card key={u.id} className="overflow-hidden skeu-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-foreground">{u.full_name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {u.email}
                  </div>
                </div>
                <Badge 
                  variant={u.lifecycle_status === 'ACTIVE' ? 'outline' : 'destructive'} 
                  className={u.lifecycle_status === 'ACTIVE' ? 'border-green-500 text-green-600' : ''}
                >
                  {u.lifecycle_status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <span className="text-muted-foreground">Global Role</span>
                  <div className="font-medium capitalize">{u.global_role.replace('_', ' ')}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Pharmacy</span>
                  <div className="font-medium truncate">{u.pharmacy_name}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <div className="text-xs text-muted-foreground capitalize">
                  {u.membership_role.replace('_', ' ')}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setEditUser(u)}>
                    <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteUser(u)} disabled={u.lifecycle_status !== 'ACTIVE'}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground skeu-card">No users found match your criteria.</CardContent></Card>
      )}

      <PaginationControls 
        page={pagination.page} 
        totalPages={pagination.totalPages}
        canPrev={pagination.canPrev}
        canNext={pagination.canNext}
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
        onPageSizeChange={pagination.setPageSize}
        onPageChange={pagination.setPage}
      />

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md dialog-skeu">
          <DialogHeader>
            <DialogTitle className="text-emboss">Provision New User</DialogTitle>
            <DialogDescription>Create a new account and assign a role/pharmacy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Min 6 chars" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(v: UserRole) => setFormData({...formData, role: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pharmacy_staff">Staff</SelectItem>
                    <SelectItem value="admin">Pharmacy Admin</SelectItem>
                    {myRole === 'super_admin' && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {myRole === 'super_admin' && (
                <div className="space-y-2">
                  <Label>Pharmacy</Label>
                  <Select value={formData.pharmacy_id} onValueChange={v => setFormData({...formData, pharmacy_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {pharmacies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Provisioning...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={o => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md dialog-skeu">
          <DialogHeader>
            <DialogTitle className="text-emboss">Edit User Details</DialogTitle>
            <DialogDescription>Update the user's name and system roles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editUser?.full_name || ''} onChange={e => editUser && setEditUser({...editUser, full_name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Global System Role</Label>
              <Select 
                value={editUser?.global_role} 
                onValueChange={(v: UserRole) => editUser && setEditUser({...editUser, global_role: v})}
                disabled={myRole !== 'super_admin' && editUser?.global_role === 'super_admin'}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pharmacy_staff">Staff</SelectItem>
                  <SelectItem value="admin">Pharmacy Admin</SelectItem>
                  {myRole === 'super_admin' && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pharmacy Membership Role</Label>
              <Select value={editUser?.membership_role} onValueChange={(v: UserRole) => editUser && setEditUser({...editUser, membership_role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pharmacy_staff">Staff</SelectItem>
                  <SelectItem value="admin">Pharmacy Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={() => editUser && updateMutation.mutate(editUser)}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demotion Alert */}
      <AlertDialog open={!!demoteUser} onOpenChange={o => !o && setDemoteUser(null)}>
        <AlertDialogContent className="dialog-skeu">
          <AlertDialogHeader>
            <AlertDialogTitle>Demote to Staff?</AlertDialogTitle>
            <AlertDialogDescription>
              This will strip <strong>{demoteUser?.full_name}</strong> of their administrative privileges both globally and within their pharmacy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDemote} className="bg-amber-600 hover:bg-amber-700">Demote User</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteUser} onOpenChange={o => !o && setDeleteUser(null)}>
        <AlertDialogContent className="dialog-skeu">
          <AlertDialogHeader>
            <AlertDialogTitle>Request Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              This will move <strong>{deleteUser?.full_name}</strong> to the system trash. Access will be revoked immediately and data will be purged in 48 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteUser && deleteMutation.mutate(deleteUser)} className="bg-destructive hover:bg-destructive/90">
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagementPage;
