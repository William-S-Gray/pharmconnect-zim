import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Clock, AlertCircle, ShieldAlert, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { approveDeletion, subscribeToDeleteRequests } from '@/lib/lifecycleUtils';

interface DeleteRequest {
  id: string;
  created_at: string;
  requester_id: string;
  requester_email?: string;
  target_table: string;
  target_id: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  reason: string;
  target_name?: string;
}

const AdminDeleteRequestsPage = () => {
  const { role, pharmacy } = useAuth();
  const queryClient = useQueryClient();
  const [newRequestCount, setNewRequestCount] = useState(0);

  // Fetch pending delete requests
  const { data: requests = [], isLoading } = useQuery<DeleteRequest[]>({
    queryKey: ['system', 'delete-requests', role, pharmacy?.id],
    queryFn: async () => {
      // The endpoint joins the requester's profile, so this shows who
      // actually asked instead of labelling every row 'Staff User'.
      const rows = await api.admin.deleteRequests('PENDING');
      return rows.map((r: any) => ({ ...r, requester_email: r.requester_name || 'Unknown' }));
    }
  });

  // Realtime Subscription
  useEffect(() => {
    const pId = role === 'super_admin' ? undefined : pharmacy?.id;
    const unsubscribe = subscribeToDeleteRequests(pId, () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'delete-requests'] });
      setNewRequestCount(prev => prev + 1);
      toast.info('New Deletion Request', {
        // The realtime event carries identifiers only, never row contents,
        // so the toast cannot name the target table without a refetch.
        description: 'A new request requires your approval.',
        icon: <BellRing className="w-4 h-4 text-primary" />,
        duration: 8000,
      });
    });
    return () => unsubscribe();
  }, [role, pharmacy, queryClient]);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await approveDeletion(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'delete-requests'] });
      queryClient.invalidateQueries({ queryKey: ['system', 'trash'] });
      toast.success('Deletion approved. Item moved to Trash.');
    },
    onError: (err: any) => toast.error(err.message || 'Approval failed'),
  });

  const denyMutation = useMutation({
    mutationFn: async (id: string) => {
      // reviewer_id and reviewed_at are stamped server-side from the
      // session, so the client cannot attribute a decision to someone else.
      await api.admin.decideDeleteRequest(id, 'DENIED');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'delete-requests'] });
      toast.info('Deletion request denied.');
    },
  });

  if (isLoading) return <div className="py-20 text-center"><LoadingSpinner label="Polling requests..." /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-orange-500" /> Pending Authorizations
          </h1>
          <p className="text-muted-foreground text-sm">Review and authorize data deletion requests from system users</p>
        </div>
        {requests.length > 0 && (
          <Badge className="bg-orange-500 hover:bg-orange-600 animate-pulse">
            {requests.length} Pending Actions
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {requests.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-20 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-primary/20 mx-auto" />
              <p className="text-muted-foreground">All clear! No pending delete requests at this time.</p>
            </CardContent>
          </Card>
        ) : (
          requests.map((req) => (
            <Card key={req.id} className="border-l-4 border-l-orange-500">
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">{req.target_table}</Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Requested {new Date(req.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground">
                      Delete {req.target_table.slice(0, -1)} ID: <span className="font-mono text-xs">{req.target_id.slice(0, 12)}...</span>
                    </h3>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded italic border-l-2 border-primary/20">
                      &ldquo;{req.reason || 'No reason provided.'}&rdquo;
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => denyMutation.mutate(req.id)}
                      disabled={denyMutation.isPending || approveMutation.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" /> Deny
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-orange-500 hover:bg-orange-600"
                      onClick={() => approveMutation.mutate(req.id)}
                      disabled={approveMutation.isPending || denyMutation.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Authorize & Trash
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-primary/80 leading-relaxed">
            <strong>Admin Note:</strong> Authorizing a request will move the record to the System Trash buffer for 48 hours. 
            Once moved, you can still restore the record from the Trash dashboard before the automated purge cycles.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDeleteRequestsPage;
