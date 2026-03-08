import { useState } from 'react';
import { Bell, Phone, Clock, Send, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

const mockDrugThresholds = [
  { id: '1', drug: 'Metformin 500mg', threshold: 15, alertsEnabled: true },
  { id: '2', drug: 'Amoxil 500mg', threshold: 10, alertsEnabled: true },
  { id: '3', drug: 'Panadol 500mg', threshold: 20, alertsEnabled: false },
  { id: '4', drug: 'Ibuprofen 400mg', threshold: 10, alertsEnabled: true },
  { id: '5', drug: 'Ciprofloxacin 500mg', threshold: 12, alertsEnabled: true },
];

const AlertSettingsPage = () => {
  const [phone, setPhone] = useState('0771 234 567');
  const [defaultThreshold, setDefaultThreshold] = useState(10);
  const [frequency, setFrequency] = useState('daily');
  const [drugThresholds, setDrugThresholds] = useState(mockDrugThresholds);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    toast({ title: 'Settings saved', description: 'Your alert preferences have been updated.' });
  };

  const handleTestSMS = () => {
    toast({ title: 'Test SMS sent', description: `A test message has been sent to ${phone}.` });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground">Alert Settings</h1>
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
            <Button variant="outline" size="sm" onClick={handleTestSMS}>
              <Send className="w-4 h-4 mr-1" />
              Send Test SMS
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Per-Drug Thresholds</CardTitle>
          <CardDescription>Override the default threshold for specific drugs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_100px_80px] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Drug</span>
              <span>Threshold</span>
              <span>Alerts</span>
            </div>

            {drugThresholds.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_100px_80px] gap-3 items-center px-3 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
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

      {/* Save Button */}
      <div className="flex gap-3 pt-2">
        <Button onClick={handleSave} className="gap-2">
          <Save className="w-4 h-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default AlertSettingsPage;
