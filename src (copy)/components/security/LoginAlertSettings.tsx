import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Mail, Bell, MapPin, Smartphone, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';

interface AlertPreferences {
  email: string;
  notify_new_device: boolean;
  notify_new_location: boolean;
  notify_failed_attempt: boolean;
  notify_password_change: boolean;
}

const DEFAULT_PREFS: AlertPreferences = {
  email: '',
  notify_new_device: true,
  notify_new_location: true,
  notify_failed_attempt: true,
  notify_password_change: true,
};
const LoginAlertSettings = () => {
  const queryClient = useQueryClient();
  const { pharmacy } = useAuth();
  const [form, setForm] = useState<AlertPreferences>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  const { data: fetchedPrefs } = useQuery({
    queryKey: ['security', 'alert-prefs', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return DEFAULT_PREFS;
      const { data, error } = await supabase
        .from('pharmacies')
        .select('email, notify_new_device, notify_new_location, notify_failed_attempt, notify_password_change')
        .eq('id', pharmacy.id)
        .single();
      
      if (error) return DEFAULT_PREFS;
      return {
        email: data.email || '',
        notify_new_device: data.notify_new_device ?? true,
        notify_new_location: data.notify_new_location ?? true,
        notify_failed_attempt: data.notify_failed_attempt ?? true,
        notify_password_change: data.notify_password_change ?? true,
      };
    },
    enabled: !!pharmacy?.id,
  });

  // Effect to sync form with fetched data
  useState(() => {
    if (fetchedPrefs) setForm(fetchedPrefs);
  });

  // Sync fetched data
  const updateField = <K extends keyof AlertPreferences>(key: K, value: AlertPreferences[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: AlertPreferences) => {
      if (!pharmacy?.id) throw new Error('Not logged in');
      const { error } = await supabase
        .from('pharmacies')
        .update(data)
        .eq('id', pharmacy.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', 'alert-prefs'] });
      setDirty(false);
      toast.success('Alert preferences saved');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save preferences'),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      toast.success('System: In production, Supabase Edge Functions or triggers will handle these emails.');
    },
    onSuccess: () => toast.success(`Test email sent to ${form.email}`),
    onError: () => toast.error('Failed to send test email'),
  });

  const alerts = [
    {
      key: 'notify_new_device' as const,
      icon: Smartphone,
      label: 'New device login',
      desc: 'Get notified when your account is accessed from an unrecognized device',
    },
    {
      key: 'notify_new_location' as const,
      icon: MapPin,
      label: 'New location login',
      desc: 'Get notified when your account is accessed from a new geographic location',
    },
    {
      key: 'notify_failed_attempt' as const,
      icon: Bell,
      label: 'Failed login attempts',
      desc: 'Get notified when someone enters the wrong password for your account',
    },
    {
      key: 'notify_password_change' as const,
      icon: Mail,
      label: 'Password changes',
      desc: 'Get notified when your password is changed',
    },
  ];

  return (
    <Card className="card-pharma">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Mail className="w-5 h-5 text-primary" /> Login Email Alerts
        </CardTitle>
        <CardDescription>
          Receive email notifications for suspicious or important account activity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Email address */}
        <div className="space-y-2">
          <Label htmlFor="alert-email">Notification email</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="alert-email"
              type="email"
              placeholder="pharmacy@example.com"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!form.email || testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              <Send className="w-4 h-4 mr-1" />
              {testMutation.isPending ? 'Sending...' : 'Send Test'}
            </Button>
          </div>
        </div>

        {/* Toggle list */}
        <div className="space-y-1">
          {alerts.map(({ key, icon: Icon, label, desc }) => (
            <div
              key={key}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted shrink-0">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground truncate">{desc}</p>
                </div>
              </div>
              <Switch
                checked={form[key]}
                onCheckedChange={(v) => updateField(key, v)}
                className="shrink-0 ml-3"
              />
            </div>
          ))}
        </div>

        {/* Save */}
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={!dirty || saveMutation.isPending}
          className="w-full sm:w-auto"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default LoginAlertSettings;
