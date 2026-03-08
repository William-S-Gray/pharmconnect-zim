import { useState, useEffect } from 'react';
import { Save, Building2, MapPin, Phone, Mail, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const PharmacyProfilePage = () => {
  const { pharmacy } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    address: '',
    suburb: '',
    city: 'Harare',
    phone: '',
    email: '',
    mcazLicense: '',
    isOpen24h: false,
  });

  const [hours, setHours] = useState({
    monday: { open: '08:00', close: '18:00', closed: false },
    tuesday: { open: '08:00', close: '18:00', closed: false },
    wednesday: { open: '08:00', close: '18:00', closed: false },
    thursday: { open: '08:00', close: '18:00', closed: false },
    friday: { open: '08:00', close: '18:00', closed: false },
    saturday: { open: '08:00', close: '13:00', closed: false },
    sunday: { open: '09:00', close: '12:00', closed: true },
  });

  useEffect(() => {
    if (pharmacy) {
      setForm({
        name: pharmacy.name || '',
        address: '',
        suburb: pharmacy.suburb || '',
        city: pharmacy.city || 'Harare',
        phone: pharmacy.phone || '',
        email: pharmacy.email || '',
        mcazLicense: '',
        isOpen24h: false,
      });
      // Fetch full profile from API
      setIsLoading(true);
      api.get('/api/pharmacy/profile')
        .then(res => {
          const p = res.data;
          setForm({
            name: p.name || pharmacy.name || '',
            address: p.address || '',
            suburb: p.suburb || pharmacy.suburb || '',
            city: p.city || pharmacy.city || 'Harare',
            phone: p.phone || pharmacy.phone || '',
            email: p.email || pharmacy.email || '',
            mcazLicense: p.mcaz_license || '',
            isOpen24h: p.is_open_24h || false,
          });
          if (p.operating_hours) {
            setHours(p.operating_hours);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [pharmacy]);

  const updateField = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateHours = (day: string, field: string, value: string | boolean) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day as keyof typeof prev], [field]: value },
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await api.put('/api/pharmacy/profile', {
        name: form.name,
        address: form.address,
        suburb: form.suburb,
        city: form.city,
        phone: form.phone,
        email: form.email,
        mcaz_license: form.mcazLicense,
        is_open_24h: form.isOpen24h,
        operating_hours: hours,
      });
      toast({ title: 'Profile updated', description: 'Your pharmacy details have been saved.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to save profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingSpinner size="lg" label="Loading profile..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Pharmacy Profile</h1>
        <p className="text-muted-foreground text-sm">Manage your pharmacy details and operating hours</p>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="w-4 h-4 text-primary" />
            Pharmacy Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Pharmacy Name</Label>
              <Input id="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcaz">MCAZ Licence Number</Label>
              <Input id="mcaz" value={form.mcazLicense} onChange={(e) => updateField('mcazLicense', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="w-4 h-4 text-primary" />
            Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Physical Address</Label>
            <Input id="address" value={form.address} onChange={(e) => updateField('address', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="suburb">Suburb</Label>
              <Input id="suburb" value={form.suburb} onChange={(e) => updateField('suburb', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Select value={form.city} onValueChange={(v) => updateField('city', v)}>
                <SelectTrigger id="city">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Harare">Harare</SelectItem>
                  <SelectItem value="Mutare">Mutare</SelectItem>
                  <SelectItem value="Bulawayo">Bulawayo</SelectItem>
                  <SelectItem value="Gweru">Gweru</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-4 h-4 text-primary" />
            Contact Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operating Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-4 h-4 text-primary" />
            Operating Hours
          </CardTitle>
          <CardDescription>
            <div className="flex items-center gap-3 mt-2">
              <Switch
                checked={form.isOpen24h}
                onCheckedChange={(v) => updateField('isOpen24h', v)}
                id="open24h"
              />
              <Label htmlFor="open24h" className="cursor-pointer text-sm">Open 24 hours</Label>
            </div>
          </CardDescription>
        </CardHeader>
        {!form.isOpen24h && (
          <CardContent>
            <div className="skeu-inset p-1">
              {days.map((day) => {
                const h = hours[day];
                return (
                  <div
                    key={day}
                    className="grid grid-cols-[100px_1fr] sm:grid-cols-[120px_100px_100px_80px] gap-3 items-center py-2.5 px-3 border-b border-border last:border-0 bg-card"
                  >
                    <span className="text-sm font-medium capitalize text-foreground text-emboss">{day}</span>
                    {h.closed ? (
                      <span className="text-sm text-muted-foreground col-span-1 sm:col-span-2">Closed</span>
                    ) : (
                      <>
                        <Input
                          type="time"
                          value={h.open}
                          onChange={(e) => updateHours(day, 'open', e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Input
                          type="time"
                          value={h.close}
                          onChange={(e) => updateHours(day, 'close', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </>
                    )}
                    <Switch
                      checked={!h.closed}
                      onCheckedChange={(v) => updateHours(day, 'closed', !v)}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-4 h-4 text-primary" />
            Account Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <span className="badge-approved">{pharmacy?.status || 'PENDING'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Plan:</span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: 'linear-gradient(180deg, hsl(174 60% 40%) 0%, hsl(174 100% 28%) 100%)',
                  color: 'white',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.3) inset, 0 1px 3px rgba(0,0,0,0.1)',
                  textShadow: '0 1px 1px rgba(0,0,0,0.2)',
                }}
              >
                {pharmacy?.plan_tier || 'FREE'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex gap-3 pt-2">
        <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default PharmacyProfilePage;
