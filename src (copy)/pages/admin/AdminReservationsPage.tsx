import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Phone, Package, Hash, User, Clock,
  CheckCircle, XCircle, MessageCircle, RefreshCw,
  ShoppingBag, Search, Filter, Home
} from 'lucide-react';
import { logAuditEvent } from '@/lib/auditUtils';

type ReservationStatus = 'PENDING' | 'CONTACTED' | 'FULFILLED' | 'CANCELLED';

interface Reservation {
  id: string;
  drug_name: string;
  patient_name: string;
  patient_phone: string;
  quantity: number;
  unit_price: number | null;
  status: ReservationStatus;
  reference_code: string;
  notes: string | null;
  created_at: string;
  pharmacy_id: string;
  pharmacies: {
    name: string;
    city: string;
  };
}

const STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING:   { label: 'Pending',   color: '#92400e', bg: 'hsl(38 92% 92%)',  border: 'hsl(38 80% 72%)' },
  CONTACTED: { label: 'Contacted', color: '#1d4ed8', bg: 'hsl(217 91% 94%)', border: 'hsl(217 70% 75%)' },
  FULFILLED: { label: 'Fulfilled', color: '#166534', bg: 'hsl(142 70% 93%)', border: 'hsl(142 60% 73%)' },
  CANCELLED: { label: 'Cancelled', color: '#6b7280', bg: 'hsl(220 14% 95%)', border: 'hsl(220 13% 80%)' },
};

const AdminReservationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // ── Fetch all reservations ──────────────────────────────────────────────
  const { data: reservations = [], isLoading, refetch } = useQuery<Reservation[]>({
    queryKey: ['admin', 'reservations', statusFilter],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      
      let query = supabase
        .from('drug_reservations')
        .select('*, pharmacies(name, city)')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Reservation[];
    },
    enabled: isSupabaseConfigured,
  });

  // ── Filtered data ───────────────────────────────────────────────────────
  const filtered = reservations.filter(r => 
    r.reference_code.toLowerCase().includes(search.toLowerCase()) ||
    r.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    r.drug_name.toLowerCase().includes(search.toLowerCase()) ||
    r.pharmacies?.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Status update mutation ──────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, status, ref, pharmacyName }: { id: string; status: ReservationStatus, ref: string, pharmacyName: string }) => {
      const { error } = await supabase
        .from('drug_reservations')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      await logAuditEvent({
        action: 'update',
        category: 'drug_mgmt',
        target: ref,
        detail: `Reservation ${ref} for pharmacy ${pharmacyName} marked as ${status}`,
        metadata: { reservation_id: id, status }
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reservations'] });
      toast.success(`Reservation marked as ${vars.status.toLowerCase()}`);
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update reservation'),
  });

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingSpinner size="lg" label="Loading system reservations…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">System Reservations</h1>
          <p className="text-sm text-muted-foreground">Monitor drug reservations across all pharmacies</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 h-9">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, patient, drug or pharmacy..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 skeu-inset"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground mr-1" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40 h-10 btn-skeu-outline">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CONTACTED">Contacted</SelectItem>
              <SelectItem value="FULFILLED">Fulfilled</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.length === 0 ? (
          <div className="card-pharma flex flex-col items-center py-16 text-center">
            <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="font-heading font-semibold text-foreground mb-1">No reservations found</p>
            <p className="text-sm text-muted-foreground">Adjust your filters or search terms.</p>
          </div>
        ) : (
          filtered.map(r => {
            const cfg = STATUS_CONFIG[r.status];
            return (
              <div
                key={r.id}
                className="card-pharma p-5 flex flex-col md:flex-row md:items-start gap-4 transition-all hover:shadow-md"
              >
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      {cfg.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
                      <Hash className="w-3 h-3" />{r.reference_code}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <p className="font-heading font-bold text-foreground flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        {r.drug_name}
                        {r.quantity > 1 && <span className="text-muted-foreground font-normal text-sm">× {r.quantity}</span>}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                        <Home className="w-3.5 h-3.5" />
                        <span className="font-medium text-foreground">{r.pharmacies?.name}</span>
                        <span>({r.pharmacies?.city})</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        {r.patient_name}
                      </p>
                      <p className="text-sm text-primary flex items-center gap-2 ml-6">
                        <Phone className="w-3.5 h-3.5" />
                        {r.patient_phone}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-row md:flex-col gap-2 pt-2 md:pt-0">
                  <Select 
                    value={r.status} 
                    onValueChange={(val) => updateMutation.mutate({ 
                      id: r.id, 
                      status: val as ReservationStatus, 
                      ref: r.reference_code,
                      pharmacyName: r.pharmacies?.name || 'Unknown'
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs w-full md:w-32 bg-muted/50 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="CONTACTED">Contacted</SelectItem>
                      <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="flex gap-2 w-full md:w-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 md:flex-none text-xs"
                      onClick={() => window.open(`tel:${r.patient_phone}`)}
                    >
                      <Phone className="w-3 h-3 mr-1" /> Call
                    </Button>
                    {r.status === 'PENDING' && (
                       <Button
                        size="sm"
                        className="h-8 flex-1 md:flex-none text-xs bg-accent text-white"
                        onClick={() => updateMutation.mutate({ 
                          id: r.id, 
                          status: 'CONTACTED', 
                          ref: r.reference_code,
                          pharmacyName: r.pharmacies?.name || 'Unknown' 
                        })}
                        disabled={updateMutation.isPending}
                      >
                        <MessageCircle className="w-3 h-3 mr-1" /> Contact
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminReservationsPage;
