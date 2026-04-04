import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Phone, User, Clock, CheckCircle, Search, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const PharmacyRequestsPage = () => {
  const { pharmacy } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['drug-requests', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return [];
      const { data, error } = await supabase
        .from('drug_requests')
        .select(`
          *,
          drug:drugs (generic_name, common_name, brand_names, strength, form)
        `)
        .eq('pharmacy_id', pharmacy.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!pharmacy?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: any) => {
      const { error } = await supabase
        .from('drug_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drug-requests'] });
      toast.success('Request status updated');
    },
    onError: (error: any) => toast.error(error.message || 'Update failed'),
  });

  const filtered = requests.filter((r: any) => 
    r.drug?.common_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.drug?.generic_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.sender_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss text-primary">Patient Drug Requests</h1>
          <p className="text-muted-foreground text-sm">Respond to patients looking for specific medications</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search request or drug..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 skeu-inset h-10"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner size="lg" label="Sourcing requests..." />
      ) : filtered.length === 0 ? (
        <Card className="skue-inset border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20 text-primary" />
            <p>No drug requests found. When patients find your stock, their inquiries will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((r: any) => (
            <Card key={r.id} className={`overflow-hidden shadow-sm hover:shadow-md transition-shadow border-l-4 ${
              r.status === 'NEW' ? 'border-primary' : 'border-muted'
            }`}>
              <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === 'NEW' ? 'default' : 'outline'}>
                      {r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div>
                    <h3 className="font-heading font-bold text-lg text-foreground">
                      {r.drug?.common_name || r.drug?.generic_name} 
                      <span className="text-sm font-normal text-muted-foreground ml-2">({r.drug?.strength}, {r.drug?.form})</span>
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1 text-foreground font-medium">
                        <User className="w-4 h-4 text-primary" /> {r.sender_name}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="w-4 h-4 text-accent" /> {r.sender_contact}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-9 btn-skeu-outline"
                    onClick={() => {
                        const contact = r.sender_contact;
                        if (contact.includes('@')) {
                            window.location.href = `mailto:${contact}?subject=Request for ${r.drug?.common_name}`;
                        } else {
                            window.location.href = `tel:${contact}`;
                        }
                    }}
                  >
                    <Mail className="w-4 h-4 mr-2" /> Contact Patient
                  </Button>
                  
                  {r.status === 'NEW' ? (
                    <Button 
                      size="sm" 
                      className="h-9 btn-skeu-primary"
                      onClick={() => updateStatusMutation.mutate({ id: r.id, status: 'CONTACTED' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> Mark as Contacted
                    </Button>
                  ) : r.status === 'CONTACTED' ? (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-9 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => updateStatusMutation.mutate({ id: r.id, status: 'COMPLETED' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> Mark as Fulfilled
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PharmacyRequestsPage;
