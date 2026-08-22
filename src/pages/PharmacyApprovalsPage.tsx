import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Eye, User, Clock } from 'lucide-react';
import { toast } from 'sonner';

const PharmacyApprovalsPage = () => {
  const { pharmacy, isPharmacyAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['pending-approvals', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return [];
      // requester_name / requester_email arrive flat on the row.
      return api.approvals.list(pharmacy.id, 'PENDING');
    },
    enabled: !!pharmacy?.id,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status }: any) => {
      // Applying the queued change and flipping the approval's status now
      // happen in one server-side transaction. Doing it from the browser
      // meant an approval could be marked APPROVED while the write that
      // was supposed to accompany it had failed.
      if (status === 'APPROVED') {
        await api.approvals.approve(pharmacy!.id, id);
        return;
      }
      await api.approvals.reject(pharmacy!.id, id);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      toast.success(`Request ${vars.status === 'APPROVED' ? 'approved' : 'rejected'} successfully`);
    },
    onError: (error: any) => toast.error(error.message || 'Action failed'),
  });

  if (!isPharmacyAdmin) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">Only Pharmacy Administrators can review approvals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Pharmacy Approvals</h1>
        <p className="text-muted-foreground text-sm">Review inventory changes requested by staff</p>
      </div>

      {isLoading ? (
        <LoadingSpinner size="lg" label="Fetching pending changes..." />
      ) : approvals.length === 0 ? (
        <Card className="skue-inset border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Check className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No pending approvals. Your inventory is up to date!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {approvals.map((item: any) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row md:items-center">
                  <div className={`w-2 h-full md:w-full md:h-1 absolute left-0 top-0 ${
                    item.action_type === 'CREATE' ? 'bg-green-500' : 
                    item.action_type === 'UPDATE' ? 'bg-blue-500' : 'bg-red-500'
                  }`} />
                  
                  <div className="p-4 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={
                        item.action_type === 'CREATE' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                        item.action_type === 'UPDATE' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                        'bg-red-500/10 text-red-600 border-red-500/20'
                      }>
                        {item.action_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <h3 className="font-semibold text-foreground">
                      {item.action_type === 'CREATE' ? 'Add New Drug' : 
                       item.action_type === 'UPDATE' ? 'Update Existing Stock' : 'Delete Stock Entry'}
                    </h3>
                    
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-3 h-3" />
                      </div>
                      <span>Requested by: <strong>{item.requester?.full_name || item.requester?.email}</strong></span>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 border-l border-border flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="bg-background"
                      onClick={() => resolveMutation.mutate({ ...item, status: 'REJECTED' })}
                      disabled={resolveMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                    <Button 
                      size="sm" 
                      className="btn-skeu-primary"
                      onClick={() => resolveMutation.mutate({ ...item, status: 'APPROVED' })}
                      disabled={resolveMutation.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PharmacyApprovalsPage;
