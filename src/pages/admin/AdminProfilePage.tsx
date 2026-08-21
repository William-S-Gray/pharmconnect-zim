import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Shield, User, Lock, Bell, Save } from 'lucide-react';

const AdminProfilePage = () => {
  const { pharmacy } = useAuth();

  const [profile, setProfile] = useState({
    name: pharmacy?.name || 'PharmConnect Zim Admin',
    email: pharmacy?.email || 'admin@pharmtrack.co.zw',
    phone: pharmacy?.phone || '',
  });

  const [passwords, setPasswords] = useState({
    current: '',
    newPassword: '',
    confirm: '',
  });

  const [notifications, setNotifications] = useState({
    newRegistrations: true,
    lowStockAlerts: true,
    systemErrors: true,
    weeklyReport: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      if (!pharmacy?.id) throw new Error('Not logged in');
      await api.pharmacies.update(pharmacy.id, {
        name: profile.name,
        phone: profile.phone,
        email: profile.email,
      });
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwords.newPassword !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwords.newPassword.length < 10) {
      toast.error('Password must be at least 10 characters');
      return;
    }
    setIsChangingPassword(true);
    try {
      // The current password is now required. Supabase's updateUser let a
      // signed-in session change the password without re-proving it, so a
      // borrowed unlocked laptop was enough to take the account over.
      await api.auth.changePassword(passwords.current, passwords.newPassword);
      toast.success('Password changed successfully');
      setPasswords({ current: '', newPassword: '', confirm: '' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      // These are the signed-in admin's own preferences, so they live on
      // their profile — not on a pharmacy, and not conflated with the
      // pharmacy's security-alert toggles, which are a different thing.
      // The previous code wrote a `metadata` column on pharmacies that no
      // migration declared, so every save was silently discarded.
      await api.profile.update({ preferences: { notifications } } as any);
      toast.success('Notification preferences saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save notification preferences');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Admin Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your admin profile and preferences</p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5 text-primary" /> Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+263 7XX XXX XXX"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isSaving}>
              <Save className="w-4 h-4 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5 text-primary" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-pw">Current Password</Label>
            <Input
              id="current-pw"
              type="password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-pw">New Password</Label>
              <Input
                id="new-pw"
                type="password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm Password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleChangePassword} disabled={isChangingPassword} variant="outline">
              <Lock className="w-4 h-4 mr-1.5" />
              {isChangingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="w-5 h-5 text-primary" /> Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'newRegistrations' as const, label: 'New Pharmacy Registrations', desc: 'Get notified when a new pharmacy registers' },
            { key: 'lowStockAlerts' as const, label: 'System-wide Low Stock Alerts', desc: 'Alert when multiple pharmacies report low stock on a drug' },
            { key: 'systemErrors' as const, label: 'System Error Alerts', desc: 'Get notified about critical system errors' },
            { key: 'weeklyReport' as const, label: 'Weekly Summary Report', desc: 'Receive a weekly email with key metrics' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={notifications[item.key]}
                onCheckedChange={(checked) => setNotifications({ ...notifications, [item.key]: checked })}
              />
            </div>
          ))}
          <Separator />
          <div className="flex justify-end">
            <Button onClick={handleSaveNotifications} variant="outline">
              <Save className="w-4 h-4 mr-1.5" /> Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-primary" /> Account Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium text-destructive">Administrator</span>
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium text-green-600">Active</span>
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium text-foreground">{pharmacy?.plan_tier || 'PRO'}</span>
            <span className="text-muted-foreground">Account ID</span>
            <span className="font-mono text-xs text-muted-foreground">{pharmacy?.id || 'admin-001'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProfilePage;
