import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Phone, Stethoscope, HeartHandshake } from 'lucide-react';
import { toast } from 'sonner';

interface RequestDrugModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  city?: string;
}

export function RequestDrugModal({ isOpen, onClose, initialQuery = '', city = 'Harare' }: RequestDrugModalProps) {
  const [requestedQuery, setRequestedQuery] = useState(initialQuery);
  const [contactInfo, setContactInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync initial query when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setRequestedQuery(initialQuery);
      setIsSuccess(false);
      setContactInfo('');
      setNotes('');
    }
  }, [isOpen, initialQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedQuery.trim()) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('drug_requests').insert([
        {
          requested_query: requestedQuery.trim(),
          city,
          contact_info: contactInfo.trim() || null,
          notes: notes.trim() || null,
          status: 'PENDING'
        }
      ]);

      if (error) throw error;

      setIsSuccess(true);
      toast.success('Drug request submitted!', {
        description: 'Pharmacies will be notified. We will reach out if you provided contact info.'
      });
      // Auto close after 2 seconds
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error('Failed to submit request:', err);
      toast.error('Submission failed', { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden border-none skeu-inner">
        {isSuccess ? (
          <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in bg-white/50 backdrop-blur-md">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <HeartHandshake className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-heading font-semibold text-foreground mb-3">Request Received!</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              Thank you. Our network of pharmacies has been alerted about <strong className="text-foreground">{requestedQuery}</strong>.
            </p>
          </div>
        ) : (
          <div className="bg-white">
            <div className="px-6 py-6 border-b bg-gradient-to-br from-primary/5 to-primary/10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-heading text-primary-900">
                  <Stethoscope className="w-5 h-5" />
                  Request a Medicine
                </DialogTitle>
                <DialogDescription className="text-sm text-primary-900/70 pt-1.5">
                  If you can't find what you're looking for, let us know! We will alert our partner pharmacies to restock.
                </DialogDescription>
              </DialogHeader>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="drugName" className="font-semibold text-foreground">Medicine Name or Symptom <span className="text-red-500">*</span></Label>
                <Input
                  id="drugName"
                  value={requestedQuery}
                  onChange={(e) => setRequestedQuery(e.target.value)}
                  placeholder="e.g. Paracetamol 500mg"
                  required
                  className="h-12 bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactInfo" className="font-semibold text-foreground flex justify-between">
                  <span>WhatsApp / Phone Number</span>
                  <span className="text-muted-foreground text-xs font-normal bg-muted px-2 py-0.5 rounded-md">Optional</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="contactInfo"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="e.g. +263 77 123 4567"
                    type="tel"
                    className="pl-10 h-12 bg-white"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground flex gap-1">
                  We'll message you as soon as it's available.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="font-semibold text-foreground flex justify-between">
                  <span>Additional Notes</span>
                  <span className="text-muted-foreground text-xs font-normal bg-muted px-2 py-0.5 rounded-md">Optional</span>
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any brand preferences or dosage details?"
                  className="resize-none h-20 bg-white"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto h-11"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !requestedQuery.trim()}
                  className="w-full sm:w-auto h-11 gap-2 skeu-button"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Submit Request
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
