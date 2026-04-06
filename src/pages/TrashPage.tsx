import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, RotateCcw, AlertTriangle, ShieldCheck, HelpCircle, Clock, Info, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { restoreRecord, logActivity } from '@/lib/lifecycleUtils';

interface TrashedItem {
  id: string;
  name: string;
  type: 'User' | 'Pharmacy' | 'Drug' | 'Record';
  table: string;
  trashed_at: string;
  trashed_by: string;
  expires_at: string;
  pharmacy_id?: string;
  pharmacy_name?: string;
}

const TrashPage = () => {
  const { role, pharmacy, user } = useAuth();
  const queryClient = useQueryClient();
  const [restoringItem, setRestoringItem] = useState<TrashedItem | null>(null);
  const [hardDeletingItem, setHardDeletingItem] = useState<TrashedItem | null>(null);

  // Fetch trashed items based on role
  const { data: trashedItems = [], isLoading } = useQuery<TrashedItem[]>({
    queryKey: ['system', 'trash', role, pharmacy?.id],
    queryFn: async () => {
      const isSuper = role === 'super_admin';
      const items: TrashedItem[] = [];

      // Fetch Trashed Profiles
      let userQuery = supabase
        .from('profiles')
        .select('id, full_name, email, trashed_at, lifecycle_status')
        .eq('lifecycle_status', 'TRASHED');
      
      if (!isSuper && pharmacy?.id) {
        // Limited to pharmacy members
        const { data: members } = await supabase.from('memberships').select('user_id').eq('pharmacy_id', pharmacy.id);
        const mIds = (members || []).map(m => m.user_id);
        userQuery = userQuery.in('id', mIds);
      }

      const { data: users } = await userQuery;
      (users || []).forEach(u => items.push({
        id: u.id,
        name: u.full_name || u.email,
        type: 'User',
        table: 'profiles',
        trashed_at: u.trashed_at,
        trashed_by: 'N/A', // Would ideally fetch from audit logs
        expires_at: new Date(new Date(u.trashed_at).getTime() + 48 * 60 * 60 * 1000).toISOString()
      }));

      // Fetch Trashed Pharmacies (Super Admin Only)
      if (isSuper) {
        const { data: pharms } = await supabase
          .from('pharmacies')
          .select('id, name, trashed_at')
          .eq('lifecycle_status', 'TRASHED');
        
        (pharms || []).forEach(p => items.push({
          id: p.id,
          name: p.name,
          type: 'Pharmacy',
          table: 'pharmacies',
          trashed_at: p.trashed_at,
          trashed_by: 'N/A',
          expires_at: new Date(new Date(p.trashed_at).getTime() + 48 * 60 * 60 * 1000).toISOString()
        }));
      }

      return items.sort((a, b) => new Date(b.trashed_at).getTime() - new Date(a.trashed_at).getTime());
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async (item: TrashedItem) => {
      const result = await restoreRecord(item.table, item.id);
      if (!result.success) throw result;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'trash'] });
      toast.success('Record restored successfully');
      setRestoringItem(null);
    },
    onError: (err: any) => {
      if (err.parent) {
        toast.error(`Restoration Failed: ${err.error}`, {
          description: `The parent ${err.parent} record is missing or trashed.`,
          duration: 6000
        });
      } else {
        toast.error(err.message || 'Restoration failed');
      }
      setRestoringItem(null);
    }
  });

  const getRemainingTime = (expiry: string) => {
    const diff = new Date(expiry).getTime() - new Date().getTime();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-destructive" /> System Trash & Recovery
          </h1>
          <p className="text-muted-foreground text-sm">Review, restore, or purge items from the deletion queue</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trash Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-destructive/20 shadow-sm overflow-hidden">
            <CardHeader className="bg-destructive/5 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Trashed Items (48h Buffer)</CardTitle>
                <Clock className="w-5 h-5 text-destructive/60" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-20 text-center"><LoadingSpinner label="Auditing trash..." /></div>
              ) : trashedItems.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                  <ShieldCheck className="w-12 h-12 text-primary/20 mx-auto" />
                  <p className="text-muted-foreground">The system trash is currently empty.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashedItems.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono uppercase">{item.id.slice(0, 8)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{item.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-xs">
                            <Clock className="w-3 h-3" />
                            {getRemainingTime(item.expires_at)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="ghost" onClick={() => setRestoringItem(item)} className="h-8 gap-1.5 text-primary hover:bg-primary/10">
                              <RotateCcw className="w-3.5 h-3.5" /> Restore
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Informational Sidebar */}
        <div className="space-y-6">
          <Tabs defaultValue="workflow" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="legal">Legal</TabsTrigger>
              <TabsTrigger value="steps">Steps</TabsTrigger>
            </TabsList>
            
            <TabsContent value="workflow">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-primary" /> Lifecycle Workflow
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-4 text-muted-foreground leading-relaxed">
                  <div className="relative pl-6 border-l-2 border-primary/20 space-y-4">
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3 h-3 rounded-full bg-primary border-4 border-background" />
                      <p className="font-semibold text-foreground">1. Deletion Request</p>
                      <p>Standard users request deletion. Admin is notified via Realtime alert for approval.</p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3 h-3 rounded-full bg-orange-500 border-4 border-background" />
                      <p className="font-semibold text-foreground">2. Trash Buffer</p>
                      <p>Approved items move to Trash where they stay locked for exactly 48 hours.</p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3 h-3 rounded-full bg-destructive border-4 border-background" />
                      <p className="font-semibold text-foreground">3. Automated Purge</p>
                      <p>Upon expiry, the system performs a hard delete from the database and authentication vault.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="legal">
              <Card className="border-orange-500/20 bg-orange-500/5">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-orange-600" /> Compliance Notice
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-[11px] space-y-3 text-orange-900/80 dark:text-orange-200/80">
                  <p>
                    In accordance with <strong>Zimbabwe Health Professions Act</strong> and data retention guidelines:
                  </p>
                  <ul className="list-disc pl-4 space-y-2">
                    <li>Deletion of personnel or pharmacy records must be audited for system integrity.</li>
                    <li>The 48-hour buffer serves as a mandatory "Cooling-Off" period to prevent malicious or accidental data loss.</li>
                    <li>Restoration of records is only permitted if the original organizational parent (Pharmacy) still exists as an ACTIVE entity.</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="steps">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-primary" /> How to Manage Trash
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-3">
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded bg-muted flex items-center justify-center shrink-0">1</div>
                    <p>Review the list of pending deletions periodically.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded bg-muted flex items-center justify-center shrink-0">2</div>
                    <p>Click <strong>Restore</strong> to immediately return an item to ACTIVE status.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded bg-muted flex items-center justify-center shrink-0">3</div>
                    <p>Check "Time Remaining" to see when an item will be permanently purged.</p>
                  </div>
                  <div className="flex gap-3 text-destructive font-medium pt-2">
                    <Info className="w-4 h-4 shrink-0" />
                    <p>Records cannot be recovered once hard-deleted from the main vault.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Restoration Confirmation Dialog */}
      <AlertDialog open={!!restoringItem} onOpenChange={() => setRestoringItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" /> Restore Record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will restore <strong>{restoringItem?.name}</strong> to ACTIVE status. 
              The system will perform a recursive dependency check to ensure all parent records are available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => restoringItem && restoreMutation.mutate(restoringItem)}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? 'Validating...' : 'Restore Now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrashPage;
