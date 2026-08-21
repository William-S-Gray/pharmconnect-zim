import React, { useState, useCallback } from 'react';
import { X, Phone, User, Hash, Package, AlertCircle, CheckCircle, Loader2, Truck, CreditCard, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

interface ReserveDrugModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacyId: string;
  pharmacyName: string;
  drugId?: string;
  drugName: string;
  unitPrice?: number | null;
}

type ModalStep = 'form' | 'submitting' | 'success' | 'error';

export function ReserveDrugModal({
  isOpen,
  onClose,
  pharmacyId,
  pharmacyName,
  drugId,
  drugName,
  unitPrice,
}: ReserveDrugModalProps) {
  const [step, setStep] = useState<ModalStep>('form');
  const [referenceCode, setReferenceCode] = useState('');
  const [reservedUntil, setReservedUntil] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [deliveryRequired, setDeliveryRequired] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const validate = () => {
    let ok = true;
    if (!patientName.trim() || patientName.trim().length < 2) {
      setNameError('Please enter your full name.');
      ok = false;
    } else {
      setNameError('');
    }
    const phoneClean = patientPhone.replace(/\s/g, '');
    if (!phoneClean || phoneClean.length < 9) {
      setPhoneError('Enter a valid phone number (e.g. 0771234567).');
      ok = false;
    } else {
      setPhoneError('');
    }
    if (deliveryRequired && (!deliveryAddress.trim() || deliveryAddress.trim().length < 5)) {
      setErrorMsg('Please provide a valid delivery address.');
      return false;
    }
    return ok;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    
    setStep('submitting');

    try {
      // unit_price is not sent: the server records the price the pharmacy
      // is actually charging at the moment of booking, so the client cannot
      // reserve at a price of its own choosing.
      const data = await api.reservations.create({
        pharmacy_id:   pharmacyId,
        drug_id:       drugId ?? null,
        drug_name:     drugName,
        patient_name:  patientName.trim(),
        patient_phone: patientPhone.trim(),
        quantity,
        delivery_required: deliveryRequired,
        delivery_address:  deliveryRequired ? deliveryAddress.trim() : undefined,
      });

      setReferenceCode(data?.reference_code || 'RX-??????');
      
      if (data?.reserved_until) {
        const d = new Date(data.reserved_until);
        setReservedUntil(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase());
      } else {
        const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
        setReservedUntil(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase());
      }
      
      setStep('success');
    } catch (err: any) {
      console.error('Reservation error:', err);
      setErrorMsg(err?.message || 'Failed to submit reservation. Please try again.');
      setStep('error');
    }
  }, [pharmacyId, drugId, drugName, patientName, patientPhone, quantity, unitPrice]);

  const handleClose = () => {
    setStep('form');
    setPatientName('');
    setPatientPhone('');
    setQuantity(1);
    setNameError('');
    setPhoneError('');
    setReferenceCode('');
    setReservedUntil('');
    setErrorMsg('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'hsl(var(--card))',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.1) inset',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between"
          style={{
            background: 'linear-gradient(180deg, hsl(174 90% 28%) 0%, hsl(174 100% 22%) 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.1) inset',
          }}
        >
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wide mb-0.5">Reserve Drug</p>
            <h2 className="text-white font-heading font-bold text-lg leading-tight">{drugName}</h2>
            <p className="text-white/75 text-sm">{pharmacyName}</p>
          </div>
          <button onClick={handleClose} className="text-white/70 hover:text-white transition-colors mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 'form' && (
            <div className="space-y-4">
              {/* Price summary */}
              {unitPrice != null && (
                <div
                  className="flex items-center justify-between p-3 rounded-xl text-sm"
                  style={{
                    background: 'linear-gradient(180deg, hsl(174 40% 96%) 0%, hsl(174 30% 93%) 100%)',
                    border: '1px solid hsl(174 30% 84%)',
                  }}
                >
                  <span className="text-foreground">Price per unit</span>
                  <span className="font-mono font-bold text-foreground">${unitPrice.toFixed(2)}</span>
                </div>
              )}

              {/* Name field */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Your Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reserve-patient-name"
                    value={patientName}
                    onChange={e => setPatientName(e.target.value)}
                    placeholder="e.g. Tatenda Moyo"
                    className={`pl-9 ${nameError ? 'border-destructive' : ''}`}
                  />
                </div>
                {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
              </div>

              {/* Phone field */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  WhatsApp / Phone Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reserve-patient-phone"
                    value={patientPhone}
                    onChange={e => setPatientPhone(e.target.value)}
                    placeholder="e.g. 0771234567"
                    type="tel"
                    className={`pl-9 ${phoneError ? 'border-destructive' : ''}`}
                  />
                </div>
                {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Quantity</label>
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reserve-quantity"
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Delivery Toggle */}
              <div 
                className={`p-3 rounded-xl border transition-all cursor-pointer ${deliveryRequired ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card'}`}
                onClick={() => setDeliveryRequired(!deliveryRequired)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${deliveryRequired ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Home Delivery</p>
                      <p className="text-xs text-muted-foreground">Get it delivered to your doorstep</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${deliveryRequired ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                    {deliveryRequired && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              </div>

              {deliveryRequired && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-medium text-foreground block">Delivery Address *</label>
                  <div className="relative">
                    <Home className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <textarea
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      placeholder="Street address, Suburb, City..."
                      className="w-full min-h-[80px] pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
              )}

              {deliveryRequired && unitPrice != null && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
                  <CreditCard className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Payment Required:</strong> Delivery orders must be paid via EcoCash/Paynow to secure the service. A platform fee of 2% applies.
                  </p>
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                The pharmacy will contact you to confirm availability and arrange collection or delivery. Reservations do not guarantee stock.
              </p>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                <Button className="flex-1" onClick={handleSubmit}>Confirm Reservation</Button>
              </div>
            </div>
          )}

          {step === 'submitting' && (
            <div className="flex flex-col items-center py-10 gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Sending your reservation…</p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'hsl(142 70% 45% / 0.15)', border: '2px solid hsl(142 70% 45%)' }}
              >
                <CheckCircle className="w-8 h-8" style={{ color: 'hsl(142 70% 45%)' }} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-xl text-foreground mb-1">Reservation Sent!</h3>
                <p className="text-sm text-muted-foreground">
                  {pharmacyName} will contact you on <strong className="text-foreground">{patientPhone}</strong> shortly.
                </p>
              </div>
              <div
                className="w-full rounded-xl p-4"
                style={{
                  background: 'linear-gradient(180deg, hsl(210 25% 97%) 0%, hsl(210 20% 94%) 100%)',
                  border: '1px solid hsl(214 20% 84%)',
                }}
              >
                <p className="text-xs text-muted-foreground mb-1">Your reference code</p>
                <div className="flex items-center gap-2 justify-center">
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="font-mono font-bold text-lg text-foreground tracking-widest">{referenceCode}</span>
                </div>
                {reservedUntil && (
                  <p className="text-sm font-medium text-primary mt-2">
                    Reserved until {reservedUntil}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Quote this code when calling the pharmacy.</p>
              </div>
              <Button className="w-full" onClick={handleClose}>Done</Button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'hsl(0 72% 51% / 0.12)', border: '2px solid hsl(0 72% 51%)' }}
              >
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-xl text-foreground mb-1">Submission Failed</h3>
                <p className="text-sm text-muted-foreground">{errorMsg}</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Close</Button>
                <Button className="flex-1" onClick={() => setStep('form')}>Try Again</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
