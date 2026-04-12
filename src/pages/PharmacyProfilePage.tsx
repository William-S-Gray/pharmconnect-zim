import { useState, useEffect } from 'react';
import { Save, Building2, MapPin, Phone, Mail, Clock, Shield, Lock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PasswordStrengthMeter, isPasswordValid } from '@/components/PasswordStrengthMeter';

const PharmacyProfilePage = () => {
  const { pharmacy } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });

  const [form, setForm] = useState({
    name: '',
    address: '',
    suburb: '',
    city: 'Harare',
    phone: '',
    whatsapp_number: '',
    email: '',
    mcazLicense: '',
    isOpen24h: false,
  });

  const [hours, setHours] = useState<Record<string, { open: string; close: string } | null>>({
    monday: { open: '08:00', close: '17:00' },
    tuesday: { open: '08:00', close: '17:00' },
    wednesday: { open: '08:00', close: '17:00' },
    thursday: { open: '08:00', close: '17:00' },
    friday: { open: '08:00', close: '17:00' },
    saturday: { open: '08:00', close: '13:00' },
    sunday: null,
  });

  useEffect(() => {
    if (pharmacy) {
      setForm({
        name: pharmacy.name || '',
        address: '',
        suburb: pharmacy.suburb || '',
        city: pharmacy.city || 'Harare',
        phone: pharmacy.phone || '',
        whatsapp_number: '',
        email: pharmacy.email || '',
        mcazLicense: '',
        isOpen24h: false,
      });
      setIsLoading(true);
      supabase
        .from('pharmacies')
        .select('*')
        .eq('id', pharmacy.id)
        .single()
        .then(({ data: p, error }) => {
          if (error) throw error;
          if (p) {
            setForm({
              name: p.name || pharmacy.name || '',
              address: p.address || '',
              suburb: p.suburb || pharmacy.suburb || '',
              city: p.city || pharmacy.city || 'Harare',
              phone: p.phone || pharmacy.phone || '',
              whatsapp_number: p.whatsapp_number || '',
              email: p.email || pharmacy.email || '',
              mcazLicense: p.mcaz_license || '',
              isOpen24h: p.is_open_24h || false,
            });
            if (p.operating_hours) {
              setHours(p.operating_hours as any);
            }
          }
        })
        .catch((err) => console.error('Profile fetch error:', err))
        .finally(() => setIsLoading(false));
    }
  }, [pharmacy]);

  const updateField = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateHours = (day: string, field: 'open' | 'close' | 'closed', value: any) => {
    setHours(prev => {
      const current = prev[day] || { open: '08:00', close: '17:00' };
      if (field === 'closed') {
        return { ...prev, [day]: value ? null : { ...current } };
      }
      return { ...prev, [day]: { ...current, [field]: value } };
    });
  };

  const copyMonToFri = () => {
    const mon = hours.monday;
    if (!mon) return;
    setHours(prev => ({
      ...prev,
      tuesday: { ...mon },
      wednesday: { ...mon },
      thursday: { ...mon },
      friday: { ...mon },
    }));
    toast({ title: 'Hours updated', description: 'Monday hours copied to all weekdays.' });
  };

  const handleSave = async () => {
    try {
      if (!pharmacy?.id) return;
      setIsSaving(true);
      const { error } = await supabase
        .from('pharmacies')
        .update({
          name: form.name,
          address: form.address,
          suburb: form.suburb,
          city: form.city,
          phone: form.phone,
          whatsapp_number: form.whatsapp_number,
          mcaz_license: form.mcazLicense,
          is_open_24h: form.isOpen24h,
          operating_hours: hours,
        })
        .eq('id', pharmacy.id);
        
      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your pharmacy details have been saved.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to save profile.' });
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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  id="phone" 
                  value={form.phone} 
                  onChange={(e) => updateField('phone', e.target.value)} 
                  className="pl-10 h-11" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp Number</Label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#25D366]" />
                <Input 
                  id="whatsapp" 
                  value={form.whatsapp_number} 
                  onChange={(e) => updateField('whatsapp_number', e.target.value)} 
                  placeholder="07X XXX XXXX"
                  className="pl-10 h-11" 
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-4 h-4 text-primary" />
              Operating Hours
            </CardTitle>
            <CardDescription>Set your standard opening and closing times</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="open24h" className="cursor-pointer text-sm font-medium">Open 24/7</Label>
            <Switch
              checked={form.isOpen24h}
              onCheckedChange={(v) => updateField('isOpen24h', v)}
              id="open24h"
            />
          </div>
        </CardHeader>
        {!form.isOpen24h && (
          <CardContent className="space-y-6">
            <div className="skeu-inset rounded-xl overflow-hidden border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b text-muted-foreground">
                    <th className="text-left p-3 font-medium pl-6">Day</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-center p-3 font-medium">Open</th>
                    <th className="text-center p-3 font-medium pr-6">Close</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {days.map((day) => {
                    const h = hours[day];
                    const isClosed = h === null;
                    return (
                      <tr key={day} className="hover:bg-muted/10 transition-colors">
                        <td className="p-3 pl-6 font-medium capitalize text-foreground">{day}</td>
                        <td className="p-3">
                          <div className="flex justify-center flex-col items-center gap-1">
                             <Switch
                               checked={!isClosed}
                               onCheckedChange={(v) => updateHours(day, 'closed', !v)}
                             />
                             <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                {isClosed ? 'Closed' : 'Open'}
                             </span>
                          </div>
                        </td>
                        <td className="p-3">
                           <Input
                             type="time"
                             value={h?.open || '08:00'}
                             disabled={isClosed}
                             onChange={(e) => updateHours(day, 'open', e.target.value)}
                             className="h-9 w-28 mx-auto text-sm text-center shadow-sm"
                           />
                        </td>
                        <td className="p-3 pr-6">
                           <Input
                             type="time"
                             value={h?.close || '17:00'}
                             disabled={isClosed}
                             onChange={(e) => updateHours(day, 'close', e.target.value)}
                             className="h-9 w-28 mx-auto text-sm text-center shadow-sm"
                           />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-start">
               <Button 
                 variant="outline" 
                 size="sm" 
                 onClick={copyMonToFri}
                 className="text-xs h-9 btn-skeu-outline"
                >
                 Copy Monday to Mon–Fri
               </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-4 h-4 text-primary" />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input id="currentPassword" type="password" value={passwordForm.current} onChange={(e) => setPasswordForm(p => ({ ...p, current: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm(p => ({ ...p, newPass: e.target.value }))} />
            <PasswordStrengthMeter password={passwordForm.newPass} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
            <Input id="confirmNewPassword" type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <Button
            variant="outline"
            disabled={isChangingPassword || !passwordForm.current || !passwordForm.newPass}
            onClick={async () => {
              if (passwordForm.newPass !== passwordForm.confirm) { toast({ title: 'Error', description: "Passwords don't match" }); return; }
              if (!isPasswordValid(passwordForm.newPass)) { toast({ title: 'Error', description: 'Password does not meet all requirements' }); return; }
              try {
                setIsChangingPassword(true);
                const { error } = await supabase.auth.updateUser({
                  password: passwordForm.newPass
                });
                if (error) throw error;
                toast({ title: 'Password changed', description: 'Your password has been updated successfully.' });
                setPasswordForm({ current: '', newPass: '', confirm: '' });
              } catch (error: any) {
                toast({ title: 'Error', description: error.message || 'Failed to change password.' });
              } finally {
                setIsChangingPassword(false);
              }
            }}
          >
            {isChangingPassword ? 'Changing...' : 'Change Password'}
          </Button>
        </CardContent>
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
              <span className="plan-badge-skeu">
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
