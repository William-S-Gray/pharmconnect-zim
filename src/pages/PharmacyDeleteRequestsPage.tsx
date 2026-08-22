import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, ShieldAlert, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { approveDeletion, subscribeToDeleteRequests } from '@/lib/lifecycleUtils';

interface DeleteRequest {
  id: string;
  created_at: string;
  requester_id: string;
  target_table: string;
  target_id: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  reason: string;
  target_name?: string;
}

const PharmacyDeleteRequestsPage = () => {
  const { pharmacy } = useAuth();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery<DeleteRequest[]>({
    queryKey: ['pharmacy', 'delete-requests', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return [];
      // Scoped by the server to the caller's own requests and their
      // pharmacy's. The duplicated .eq('status', 'PENDING') in the version
      // this replaces was harmless but shows the filter chain was not read.
      const rows = await api.deleteRequests.list();
      return rows.filter((r: any) => r.status === 'PENDING') as unknown as DeleteRequest[];
    },
    enabled: !!pharmacy?.id
  });

  useEffect(() => {
    if (!pharmacy?.id) return;
    const unsubscribe = subscribeToDeleteRequests(pharmacy.id, () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'delete-requests'] });
      toast.info('New Staff Deletion Request', {
        icon: <BellRing className="w-4 h-4" />,
      });
    });
    return () => unsubscribe();
  }, [pharmacy, queryClient]);

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveDeletion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'delete-requests'] });
      queryClient.invalidateQueries({ queryKey: ['system', 'trash'] });
      toast.success('Approved move to trash.');
    },
  });

  if (isLoading) return <LoadingSpinner label="Checking requests..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="text-orange-500" /> Pending Deletions
        </h1>
        <p className="text-muted-foreground">Authorize or deny staff deletion requests.</p>
      </div>

      <div className="grid gap-4">
        {requests.length === 0 ? (
          <p className="text-center py-10 text-muted-foreground">No pending requests.</p>
        ) : (
          requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <Badge variant="outline">{req.target_table}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(req.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium italic">Reason: &ldquo;{req.reason}&rdquo;</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-destructive">Deny</Button>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => approveMutation.mutate(req.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve & Trash
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default PharmacyDeleteRequestsPage;
