import { useState, useEffect } from 'react';
import { Bell, Phone, Clock, Send, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const AlertSettingsPage = () => {
  const { pharmacy } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['alert-settings', pharmacy?.id],
    queryFn: () => api.get('/api/alerts/settings').then(r => r.data.settings),
    enabled: !!pharmacy,
  });

  const [phone, setPhone] = useState('');
  const [defaultThreshold, setDefaultThreshold] = useState(10);
  const [frequency, setFrequency] = useState('daily');
  const [drugThresholds, setDrugThresholds] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setPhone(settings.phone || '');
      setDefaultThreshold(settings.default_threshold || 10);
      setFrequency(settings.frequency || 'daily');
      setDrugThresholds(settings.drug_thresholds || []);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/api/alerts/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-settings'] });
      toast({ title: 'Settings saved', description: 'Your alert preferences have been updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to save settings.' });
    },
  });

  const testSmsMutation = useMutation({
    mutationFn: () => api.post('/api/alerts/test'),
    onSuccess: () => {
      toast({ title: 'Test SMS sent', description: `A test message has been sent to ${phone}.` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to send test SMS.' });
    },
  });

  const handleToggleAlert = (id: string) => {
    setDrugThresholds(prev =>
      prev.map(d => d.id === id ? { ...d, alertsEnabled: !d.alertsEnabled } : d)
    );
  };

  const handleThresholdChange = (id: string, value: number) => {
    setDrugThresholds(prev =>
      prev.map(d => d.id === id ? { ...d, threshold: value } : d)
    );
  };

  const handleSave = () => {
    saveMutation.mutate({
      phone,
      default_threshold: defaultThreshold,
      frequency,
      drug_thresholds: drugThresholds,
    });
  };

  const handleTestSMS = () => {
    testSmsMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingSpinner size="lg" label="Loading alert settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Alert Settings</h1>
        <p className="text-muted-foreground text-sm">Configure SMS notifications for low stock items</p>
      </div>

      {/* SMS Phone Number */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-4 h-4 text-primary" />
            SMS Alert Number
          </CardTitle>
          <CardDescription>Alerts will be sent to this number via SMS</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXXX"
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={handleTestSMS} disabled={testSmsMutation.isPending}>
              <Send className="w-4 h-4 mr-1" />
              {testSmsMutation.isPending ? 'Sending...' : 'Send Test SMS'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Default Threshold */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="w-4 h-4 text-primary" />
            Default Reorder Threshold
          </CardTitle>
          <CardDescription>Drugs below this quantity will trigger an alert</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={defaultThreshold}
              onChange={(e) => setDefaultThreshold(Number(e.target.value))}
              className="w-24"
              min={1}
            />
            <span className="text-sm text-muted-foreground">units</span>
          </div>
        </CardContent>
      </Card>

      {/* Alert Frequency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-4 h-4 text-primary" />
            Alert Frequency
          </CardTitle>
          <CardDescription>How often should we check and notify you?</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={frequency} onValueChange={setFrequency} className="space-y-3">
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="daily" id="daily" />
              <Label htmlFor="daily" className="cursor-pointer">
                <span className="font-medium">Daily at 7:00 AM</span>
                <span className="text-xs text-muted-foreground ml-2">(recommended)</span>
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="twice" id="twice" />
              <Label htmlFor="twice" className="cursor-pointer">
                <span className="font-medium">Twice daily</span>
                <span className="text-xs text-muted-foreground ml-2">(7 AM &amp; 2 PM)</span>
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="weekly" id="weekly" />
              <Label htmlFor="weekly" className="cursor-pointer">
                <span className="font-medium">Weekly</span>
                <span className="text-xs text-muted-foreground ml-2">(Monday 7 AM)</span>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Per-Drug Thresholds */}
      {drugThresholds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Per-Drug Thresholds</CardTitle>
            <CardDescription>Override the default threshold for specific drugs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="skeu-inset p-1 space-y-0">
              <div
                className="hidden sm:grid grid-cols-[1fr_100px_80px] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider rounded-t-md"
                className="hidden sm:grid grid-cols-[1fr_100px_80px] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider rounded-t-md bg-muted"
              >
                <span className="text-emboss">Drug</span>
                <span className="text-emboss">Threshold</span>
                <span className="text-emboss">Alerts</span>
              </div>

              {drugThresholds.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_100px_80px] gap-3 items-center px-3 py-3 border-b border-border last:border-0 transition-colors hover:bg-muted/30"
                  style={{ background: 'hsl(0 0% 99%)' }}
                >
                  <span className="font-mono text-sm font-medium text-foreground">{item.drug}</span>

                  <div className="flex items-center gap-2">
                    {editingId === item.id ? (
                      <Input
                        type="number"
                        value={item.threshold}
                        onChange={(e) => handleThresholdChange(item.id, Number(e.target.value))}
                        className="h-8 w-20 text-sm"
                        min={1}
                        onBlur={() => setEditingId(null)}
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => setEditingId(item.id)}
                        className="text-sm text-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        {item.threshold} units
                      </button>
                    )}
                  </div>

                  <Switch
                    checked={item.alertsEnabled}
                    onCheckedChange={() => handleToggleAlert(item.id)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex gap-3 pt-2">
        <Button onClick={handleSave} className="gap-2" disabled={saveMutation.isPending}>
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
};

export default AlertSettingsPage;
