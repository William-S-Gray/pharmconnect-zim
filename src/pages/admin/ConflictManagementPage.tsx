import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AlertTriangle, CheckCircle2, XCircle, ChevronRight, History, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ConflictRecord {
  id: string;
  table_name: string;
  record_id: string;
  local_data: any;
  server_data: any;
  status: 'PENDING' | 'RESOLVED' | 'DISCARDED';
  created_at: string;
  pharmacy_id: string;
  user_id: string;
}

const ConflictManagementPage = () => {
  const { role, pharmacy } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);

  const { data: conflicts = [], isLoading } = useQuery({
    queryKey: ['admin', 'conflicts'],
    queryFn: async () => {
      let query = supabase
        .from('sync_conflicts')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (role !== 'super_admin' && pharmacy?.id) {
        query = query.eq('pharmacy_id', pharmacy.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ConflictRecord[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ conflict, action }: { conflict: ConflictRecord, action: 'APPLY_LOCAL' | 'KEEP_SERVER' }) => {
      const { id, table_name, record_id, local_data } = conflict;

      if (action === 'APPLY_LOCAL') {
        // 1. Update the actual record in its table
        const { error: updateError } = await supabase
          .from(table_name)
          .update(local_data)
          .eq('id', record_id);
        
        if (updateError) throw updateError;

        // 2. Mark conflict as RESOLVED
        const { error: conflictError } = await supabase
          .from('sync_conflicts')
          .update({ 
            status: 'RESOLVED', 
            resolved_at: new Date().toISOString(),
            resolved_by: (await supabase.auth.getUser()).data.user?.id
          })
          .eq('id', id);

        if (conflictError) throw conflictError;
      } else {
        // KEEP_SERVER - Just mark as DISCARDED
        const { error: conflictError } = await supabase
          .from('sync_conflicts')
          .update({ 
            status: 'DISCARDED', 
            resolved_at: new Date().toISOString(),
            resolved_by: (await supabase.auth.getUser()).data.user?.id
          })
          .eq('id', id);

        if (conflictError) throw conflictError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'conflicts'] });
      toast.success(variables.action === 'APPLY_LOCAL' ? 'Local changes applied successfully' : 'Local changes discarded, server version kept');
      setSelectedConflict(null);
    },
    onError: (error: any) => {
      toast.error(`Resolution failed: ${error.message}`);
    }
  });

  const renderJsonDiff = (local: any, server: any) => {
    const keys = Array.from(new Set([...Object.keys(local), ...Object.keys(server)]));
    
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
            <History className="w-4 h-4" /> Local Attempted Change
          </h4>
          <div className="bg-muted/50 p-3 rounded-lg font-mono text-xs overflow-auto max-h-[400px] skeu-inset">
            {keys.map(key => {
              const isDifferent = JSON.stringify(local[key]) !== JSON.stringify(server[key]);
              return (
                <div key={key} className={cn("py-0.5", isDifferent && "bg-primary/10 text-primary font-bold px-1 rounded")}>
                  <span className="opacity-50">{key}:</span> {JSON.stringify(local[key] ?? null)}
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
            <Database className="w-4 h-4" /> Current Server State
          </h4>
          <div className="bg-muted/50 p-3 rounded-lg font-mono text-xs overflow-auto max-h-[400px] skeu-inset">
            {keys.map(key => {
              const isDifferent = JSON.stringify(local[key]) !== JSON.stringify(server[key]);
              return (
                <div key={key} className={cn("py-0.5", isDifferent && "bg-destructive/10 text-destructive font-bold px-1 rounded")}>
                  <span className="opacity-50">{key}:</span> {JSON.stringify(server[key] ?? null)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="py-20"><LoadingSpinner size="lg" label="Loading sync conflicts..." /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Sync Conflict Management</h1>
        <p className="text-muted-foreground text-sm">Review data collisions from offline devices and decide which version to persist.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Conflict List */}
        <Card className="lg:col-span-1 border-primary/20">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-lg flex items-center justify-between">
              Pending Conflicts
              <Badge variant="outline" className="bg-primary/5">{conflicts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border overflow-auto max-h-[600px]">
              {conflicts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>System is fully synchronized.</p>
                </div>
              ) : (
                conflicts.map((c) => (
                  <div 
                    key={c.id} 
                    className={cn(
                      "p-4 cursor-pointer hover:bg-muted/50 transition-colors relative flex items-center justify-between group",
                      selectedConflict?.id === c.id && "bg-primary/5 border-l-4 border-primary"
                    )}
                    onClick={() => setSelectedConflict(c)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px] h-4 uppercase tracking-wider">{c.table_name}</Badge>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'MMM d, HH:mm')}</span>
                      </div>
                      <p className="text-sm font-medium truncate max-w-[180px]">Record: {c.record_id.slice(0, 8)}...</p>
                    </div>
                    <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", selectedConflict?.id === c.id && "translate-x-1 text-primary")} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comparison Detail */}
        <Card className="lg:col-span-2 shadow-xl border-t-4 border-t-primary">
          {selectedConflict ? (
            <>
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      Manual Resolution Required
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Table: <span className="font-mono text-primary">{selectedConflict.table_name}</span> | 
                      ID: <span className="font-mono">{selectedConflict.record_id}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => resolveMutation.mutate({ conflict: selectedConflict, action: 'KEEP_SERVER' })}
                      disabled={resolveMutation.isPending}
                      className="border-destructive/30 hover:bg-destructive/5 text-destructive"
                    >
                      <XCircle className="w-4 h-4 mr-2" /> Keep Server
                    </Button>
                    <Button 
                      onClick={() => resolveMutation.mutate({ conflict: selectedConflict, action: 'APPLY_LOCAL' })}
                      disabled={resolveMutation.isPending}
                      className="skeu-button"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Apply Local
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {renderJsonDiff(selectedConflict.local_data, selectedConflict.server_data)}
                
                <div className="mt-8 p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-primary">Resolution Guide</p>
                    <p className="text-muted-foreground">
                      Highlighted fields indicate where the local change differs from the current server state. 
                      Choose <strong>Apply Local</strong> if the user's manual change is more recent and accurate. 
                      Choose <strong>Keep Server</strong> if the existing database record should remain untouched.
                    </p>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <div className="h-[500px] flex flex-col items-center justify-center space-y-4 text-muted-foreground opacity-50">
              <History className="w-16 h-16" />
              <p>Select a conflict from the list to begin resolution</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ConflictManagementPage;
