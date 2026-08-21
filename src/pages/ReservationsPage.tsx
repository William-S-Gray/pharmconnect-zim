import React, { useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Phone, Package, Hash, User, Clock,
  CheckCircle, XCircle, MessageCircle, RefreshCw,
  ShoppingBag, Zap,
} from 'lucide-react';

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
}

const STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING:   { label: 'Pending',   color: '#92400e', bg: 'hsl(38 92% 92%)',  border: 'hsl(38 80% 72%)' },
  CONTACTED: { label: 'Contacted', color: '#1d4ed8', bg: 'hsl(217 91% 94%)', border: 'hsl(217 70% 75%)' },
  FULFILLED: { label: 'Fulfilled', color: '#166534', bg: 'hsl(142 70% 93%)', border: 'hsl(142 60% 73%)' },
  CANCELLED: { label: 'Cancelled', color: '#6b7280', bg: 'hsl(220 14% 95%)', border: 'hsl(220 13% 80%)' },
};

const ReservationsPage: React.FC = () => {
  const { pharmacy } = useAuth();
  const queryClient = useQueryClient();

  // ── Fetch reservations ──────────────────────────────────────────────────
  const { data: reservations = [], isLoading, refetch } = useQuery<Reservation[]>({
    queryKey: ['reservations', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return [];
      const { items } = await api.reservations.list(pharmacy.id, { limit: 200 });
      return items as unknown as Reservation[];
    },
    enabled: !!pharmacy?.id,
    refetchInterval: 30000, // poll every 30s as backup
  });

  // ── Real-time subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!pharmacy?.id) return;

    // The stream is already scoped to pharmacies this session belongs to,
    // and carries identifiers only — so this invalidates and lets the query
    // refetch rather than reading a row off the wire.
    return api.subscribeToChanges(
      (event) => {
        if (event.pharmacy_id !== pharmacy.id) return;
        if (event.op === 'INSERT') {
          toast.info('📦 New reservation received', {
            action: { label: 'View', onClick: () => refetch() },
          });
        }
        queryClient.invalidateQueries({ queryKey: ['reservations', pharmacy.id] });
      },
      { tables: ['drug_reservations'] },
    );
  }, [pharmacy?.id, queryClient, refetch]);

  // ── Status update mutation ───────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      await api.reservations.update(pharmacy!.id, id, { status });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['reservations', pharmacy?.id] });
      toast.success(`Reservation marked as ${vars.status.toLowerCase()}`);
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update reservation'),
  });

  // ── Derived counts ───────────────────────────────────────────────────────
  const pendingCount  = reservations.filter(r => r.status === 'PENDING').length;
  const contactedCount = reservations.filter(r => r.status === 'CONTACTED').length;
  const fulfilledCount = reservations.filter(r => r.status === 'FULFILLED').length;

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingSpinner size="lg" label="Loading reservations…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Reservations</h1>
            {pendingCount > 0 && (
              <Badge
                className="text-xs px-2 py-0.5 animate-pulse"
                style={{
                  background: 'hsl(0 72% 51%)',
                  color: '#fff',
                  border: '1px solid hsl(0 62% 42%)',
                }}
              >
                {pendingCount} new
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Manage drug reservations from patients</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* ── Summary stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending',   value: pendingCount,   color: 'hsl(38 80% 48%)',  icon: Clock },
          { label: 'Contacted', value: contactedCount, color: 'hsl(217 70% 50%)', icon: MessageCircle },
          { label: 'Fulfilled', value: fulfilledCount, color: 'hsl(142 60% 40%)', icon: CheckCircle },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center stat-icon-skeu">
                <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
              </div>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <span className="font-heading font-bold text-2xl text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Real-time indicator ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Zap className="w-3 h-3 text-primary" />
        <span>Live updates enabled — new reservations will appear automatically</span>
      </div>

      {/* ── Reservations list ────────────────────────────────────────── */}
      {reservations.length === 0 ? (
        <div className="card-pharma flex flex-col items-center py-14 text-center">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="font-heading font-semibold text-foreground mb-1">No reservations yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            When patients reserve drugs through PharmConnect, they will appear here in real-time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map(r => {
            const cfg = STATUS_CONFIG[r.status];
            const whatsappNumber = r.patient_phone.replace(/\s+/g, '').replace(/^0/, '263');
            const whatsappMsg = encodeURIComponent(
              `Hi ${r.patient_name}, this is ${pharmacy?.name}. Regarding your reservation (${r.reference_code}) for ${r.drug_name} — `
            );
            return (
              <div
                key={r.id}
                className="card-pharma p-4 flex flex-col sm:flex-row sm:items-start gap-4"
                style={r.status === 'PENDING' ? {
                  borderColor: 'hsl(38 80% 62%)',
                  boxShadow: '0 0 0 2px hsl(38 80% 62% / 0.2), var(--shadow-card)',
                } : undefined}
              >
                {/* Left: Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      {cfg.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                      <Hash className="w-3 h-3" />{r.reference_code}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>

                  <div>
                    <p className="font-heading font-semibold text-foreground flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      {r.drug_name}
                      {r.quantity > 1 && <span className="text-muted-foreground font-normal text-sm">× {r.quantity}</span>}
                    </p>
                    {r.unit_price != null && (
                      <p className="text-sm text-muted-foreground ml-6">
                        ${r.unit_price.toFixed(2)} / unit · Total: ${(r.unit_price * r.quantity).toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      {r.patient_name}
                    </span>
                    <a
                      href={`tel:${r.patient_phone}`}
                      className="flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {r.patient_phone}
                    </a>
                    <a
                      href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-medium hover:underline"
                      style={{ color: '#25D366' }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex sm:flex-col gap-2 flex-wrap">
                  {r.status === 'PENDING' && (
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      style={{ background: 'hsl(217 70% 50%)', color: '#fff' }}
                      onClick={() => updateMutation.mutate({ id: r.id, status: 'CONTACTED' })}
                      disabled={updateMutation.isPending}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Mark Contacted
                    </Button>
                  )}
                  {r.status === 'CONTACTED' && (
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      style={{ background: 'hsl(142 60% 40%)', color: '#fff' }}
                      onClick={() => updateMutation.mutate({ id: r.id, status: 'FULFILLED' })}
                      disabled={updateMutation.isPending}
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Fulfilled
                    </Button>
                  )}
                  {r.status !== 'CANCELLED' && r.status !== 'FULFILLED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => updateMutation.mutate({ id: r.id, status: 'CANCELLED' })}
                      disabled={updateMutation.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReservationsPage;
