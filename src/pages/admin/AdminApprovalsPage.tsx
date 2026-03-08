import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Eye, Search, MapPin, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface PendingPharmacy {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  suburb: string;
  mcaz_license: string;
  submitted_at: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
}

const AdminApprovalsPage = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedPharmacy, setSelectedPharmacy] = useState<PendingPharmacy | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const { data: pharmacies = [], isLoading } = useQuery<PendingPharmacy[]>({
    queryKey: ['admin', 'pharmacies', filter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filter !== 'ALL') params.status = filter;
      const res = await api.get('/api/admin/pharmacies', { params });
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/pharmacies/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Pharmacy approved successfully');
    },
    onError: () => toast.error('Failed to approve pharmacy'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/api/admin/pharmacies/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pharmacies'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Pharmacy rejected');
      setShowRejectDialog(false);
      setRejectReason('');
      setRejectTarget(null);
    },
    onError: () => toast.error('Failed to reject pharmacy'),
  });

  const filtered = pharmacies.filter(p => {
    return !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase());
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">Pending</Badge>;
      case 'APPROVED': return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Approved</Badge>;
      case 'SUSPENDED': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Rejected</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Pharmacy Approvals</h1>
        <p className="text-muted-foreground text-sm">Review and approve pharmacy registrations</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search pharmacies..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="SUSPENDED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-8"><LoadingSpinner size="lg" label="Loading pharmacies..." /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading font-semibold text-foreground truncate">{p.name}</h3>
                      {statusBadge(p.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.suburb}, {p.city}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {p.phone}</span>
                      <span>{p.email}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs">
                      <span className="text-muted-foreground">MCAZ: <strong className={p.mcaz_license ? 'text-foreground' : 'text-destructive'}>{p.mcaz_license || 'Not provided'}</strong></span>
                      <span className="text-muted-foreground">Submitted: {new Date(p.submitted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setSelectedPharmacy(p)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                    {p.status === 'PENDING' && (
                      <>
                        <Button size="sm" onClick={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setRejectTarget(p.id); setShowRejectDialog(true); }}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No pharmacies match your filter.</CardContent></Card>
          )}
        </div>
      )}

      {/* View Details Dialog */}
      <Dialog open={!!selectedPharmacy} onOpenChange={() => setSelectedPharmacy(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedPharmacy?.name}</DialogTitle></DialogHeader>
          {selectedPharmacy && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground">{selectedPharmacy.email}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span className="text-foreground">{selectedPharmacy.phone}</span></div>
                <div><span className="text-muted-foreground">City:</span> <span className="text-foreground">{selectedPharmacy.city}</span></div>
                <div><span className="text-muted-foreground">Suburb:</span> <span className="text-foreground">{selectedPharmacy.suburb}</span></div>
                <div><span className="text-muted-foreground">MCAZ:</span> <span className="text-foreground">{selectedPharmacy.mcaz_license || 'N/A'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> {statusBadge(selectedPharmacy.status)}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Pharmacy</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection (optional)</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Provide reason..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={rejectMutation.isPending} onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget, reason: rejectReason })}>
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApprovalsPage;
