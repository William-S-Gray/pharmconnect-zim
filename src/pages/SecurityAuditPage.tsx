import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
  Shield, Monitor, Smartphone, Globe, Clock, AlertTriangle,
  CheckCircle2, XCircle, LogOut, Key, QrCode, Trash2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import LoginAlertSettings from '@/components/security/LoginAlertSettings';

// ── Types ─────────────────────────────────────────────────────────
interface Session {
  id: string;
  device: string;
  browser: string;
  ip: string;
  location: string;
  last_active: string;
  is_current: boolean;
}

interface LoginEvent {
  id: string;
  timestamp: string;
  ip: string;
  device: string;
  location: string;
  success: boolean;
  failure_reason?: string;
}

interface TwoFactorStatus {
  enabled: boolean;
  verified: boolean;
  setup_uri?: string;
  qr_code_url?: string;
  backup_codes?: string[];
}

// ── Helper ────────────────────────────────────────────────────────
function getDeviceIcon(device: string) {
  const d = device.toLowerCase();
  if (d.includes('mobile') || d.includes('phone') || d.includes('android') || d.includes('ios'))
    return Smartphone;
  if (d.includes('tablet') || d.includes('ipad'))
    return Monitor;
  return Monitor;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Demo data (used when backend unavailable) ─────────────────────
const DEMO_SESSIONS: Session[] = [
  { id: '1', device: 'Chrome on Windows', browser: 'Chrome 120', ip: '197.221.xx.xx', location: 'Harare, ZW', last_active: new Date().toISOString(), is_current: true },
  { id: '2', device: 'Safari on iPhone', browser: 'Safari 17', ip: '197.221.xx.xx', location: 'Harare, ZW', last_active: new Date(Date.now() - 3600000).toISOString(), is_current: false },
];

const DEMO_LOGIN_HISTORY: LoginEvent[] = [
  { id: '1', timestamp: new Date().toISOString(), ip: '197.221.xx.xx', device: 'Chrome on Windows', location: 'Harare, ZW', success: true },
  { id: '2', timestamp: new Date(Date.now() - 1800000).toISOString(), ip: '41.60.xx.xx', device: 'Firefox on Linux', location: 'Bulawayo, ZW', success: false, failure_reason: 'Invalid password' },
  { id: '3', timestamp: new Date(Date.now() - 7200000).toISOString(), ip: '197.221.xx.xx', device: 'Chrome on Windows', location: 'Harare, ZW', success: true },
  { id: '4', timestamp: new Date(Date.now() - 86400000).toISOString(), ip: '105.22.xx.xx', device: 'Unknown', location: 'Unknown', success: false, failure_reason: 'Account locked - too many attempts' },
  { id: '5', timestamp: new Date(Date.now() - 172800000).toISOString(), ip: '197.221.xx.xx', device: 'Safari on iPhone', location: 'Harare, ZW', success: true },
];

const DEMO_2FA: TwoFactorStatus = { enabled: false, verified: false };

// ── Component ─────────────────────────────────────────────────────
const SecurityAuditPage = () => {
  const { pharmacy } = useAuth();
  const queryClient = useQueryClient();

  // ── 2FA State ──
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [setupData, setSetupData] = useState<{ qr_code_url?: string; setup_uri?: string }>({});

  // ── Data Fetching ──
  // ── Data Fetching ──
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: async () => {
      // In Supabase, we can get the current session easily. 
      // Multi-device session listing usually requires a dedicated table or Admin API.
      // Real sessions from the server, not a single synthesised row
      // describing the current tab. Sessions are rows in the database now,
      // so every signed-in device is listed with its own last-seen time.
      const sessions = await api.auth.sessions.list();
      return sessions.map((s) => ({
        id: s.id,
        device: s.user_agent?.split(') ')[0].split(' (')[0] || 'Unknown device',
        browser: s.user_agent || 'Unknown',
        ip: s.ip_address || 'Unknown',
        location: s.ip_address || 'Unknown',
        last_active: s.last_seen_at,
        is_current: s.is_current,
      })) as Session[];
    },
  });
  
  const { data: loginHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['security', 'login-history'],
    queryFn: async () => {
      // The caller's own activity. Two earlier versions of this were
      // wrong: the original filtered audit_logs by pharmacy id against the
      // user_id column (two different id spaces, so always empty), and the
      // first port called the admin-wide endpoint, which 403s for anyone
      // who is not a super admin.
      const items = await api.profile.activity(10);
      return items.map((log) => ({
        id: log.id,
        timestamp: log.attempted_at,
        ip: log.ip_address ?? 'Unknown',
        device: 'Unknown',
        location: 'Unknown',
        // A real flag from login_attempts. Deriving this from audit_logs
        // counted every non-login event as a failed login.
        success: log.success,
        failure_reason: log.success ? undefined : 'Incorrect credentials',
      })) as LoginEvent[];
    },
  });

  const { data: twoFactorStatus = { enabled: false, verified: false }, isLoading: loading2FA } = useQuery({
    queryKey: ['security', '2fa-status'],
    queryFn: async () => {
      const me = await api.auth.me();
      const enabled = Boolean(me?.profile.mfa_enabled);
      // Only a confirmed enrolment counts, so these are the same fact: an
      // unconfirmed secret grants nothing.
      return { enabled, verified: enabled };
    },
  });

  // ── Mutations ──
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
       // There is no single-session revoke endpoint yet, so this signs out
       // every other device. Same behaviour as before, stated plainly.
       await api.auth.sessions.revokeOthers();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      toast.success('Other sessions revoked');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to revoke session'),
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.auth.sessions.revokeOthers(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      toast.success('All other sessions revoked');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to revoke sessions'),
  });

  const setup2FAMutation = useMutation({
    mutationFn: async () => {
      return api.auth.mfa.enroll();
    },
    onSuccess: (data) => {
      setSetupData({
        // An otpauth:// URI the dialog renders as a QR code. Supabase
        // returned pre-rendered SVG, which meant trusting it to draw a
        // code containing our own secret.
        qr_code_url: data.otpauth_url,
        setup_uri: data.secret,
      });
      setShow2FASetup(true);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to start 2FA setup'),
  });

  const verify2FAMutation = useMutation({
    mutationFn: async (code: string) => {
       // Actually confirms the enrolment. This was a toast saying the flow
       // was unimplemented, while the surrounding UI reported success.
       await api.auth.mfa.confirm(code);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', '2fa-status'] });
      setShow2FASetup(false);
      setTotpCode('');
      toast.success('Two-factor authentication is now enabled.');
    },
    onError: (error: any) => toast.error(error.message || 'Invalid code. Please try again.'),
  });

  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable2FA, setShowDisable2FA] = useState(false);

  // The server returns an otpauth:// URI, which is what an authenticator
  // app expects to read from a QR code — but it is not an image, so it has
  // to be rendered into one here. Supabase returned pre-rendered SVG,
  // which meant trusting it to draw a code containing our own secret.
  useEffect(() => {
    if (!setupData.qr_code_url) { setQrDataUrl(''); return; }
    let cancelled = false;
    QRCode.toDataURL(setupData.qr_code_url, { width: 192, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => console.error('QR render failed', err));
    return () => { cancelled = true; };
  }, [setupData.qr_code_url]);

  const disable2FAMutation = useMutation({
    // Gated on the password even though the caller is already signed in:
    // turning off a second factor is a downgrade of the account's
    // security, and a borrowed unlocked laptop should not be enough.
    mutationFn: async (password: string) => api.auth.mfa.disable(password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', '2fa-status'] });
      setShowDisable2FA(false);
      setDisablePassword('');
      toast.success('Two-factor authentication disabled');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to disable 2FA'),
  });

  const failedAttempts = loginHistory.filter((e) => !e.success);
  const recentFailed = failedAttempts.length;

  if (loadingSessions || loadingHistory || loading2FA) {
    return <LoadingSpinner size="lg" label="Loading security data..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center brand-icon-skeu">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Security & Access</h1>
          <p className="text-sm text-muted-foreground">Monitor sessions, login activity, and manage 2FA</p>
        </div>
      </div>

      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="card-pharma">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center stat-icon-skeu">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{sessions.length}</p>
              <p className="text-xs text-muted-foreground">Active Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-pharma">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${recentFailed > 3 ? 'bg-destructive/10' : 'stat-icon-skeu'}`}>
              <AlertTriangle className={`w-5 h-5 ${recentFailed > 3 ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{recentFailed}</p>
              <p className="text-xs text-muted-foreground">Failed Logins (recent)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-pharma">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${twoFactorStatus.enabled ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
              <Key className={`w-5 h-5 ${twoFactorStatus.enabled ? 'text-emerald-500' : 'text-amber-500'}`} />
            </div>
            <div>
              <p className="text-sm font-heading font-bold text-foreground">
                {twoFactorStatus.enabled ? '2FA Enabled' : '2FA Disabled'}
              </p>
              <p className="text-xs text-muted-foreground">Two-factor auth</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-Factor Authentication */}
      <Card className="card-pharma">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Key className="w-5 h-5 text-primary" /> Two-Factor Authentication
          </CardTitle>
          <CardDescription>Add an extra layer of security to your account using TOTP authenticator apps</CardDescription>
        </CardHeader>
        <CardContent>
          {twoFactorStatus.enabled ? (
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="font-medium text-foreground">2FA is active</p>
                  <p className="text-xs text-muted-foreground">Your account is protected with TOTP verification</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowDisable2FA(true)}
                disabled={disable2FAMutation.isPending}
              >
                {disable2FAMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="font-medium text-foreground">2FA not enabled</p>
                  <p className="text-xs text-muted-foreground">Enable 2FA for stronger account security</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setup2FAMutation.mutate()}
                disabled={setup2FAMutation.isPending}
              >
                <QrCode className="w-4 h-4 mr-1" />
                {setup2FAMutation.isPending ? 'Setting up...' : 'Enable 2FA'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card className="card-pharma">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Globe className="w-5 h-5 text-primary" /> Active Sessions
            </CardTitle>
            <CardDescription>Devices currently signed in to your account</CardDescription>
          </div>
          {sessions.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
            >
              <LogOut className="w-4 h-4 mr-1" />
              Revoke All Others
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.map((session) => {
            const DeviceIcon = getDeviceIcon(session.device);
            return (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-muted">
                    <DeviceIcon className="w-4 h-4 text-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{session.device}</p>
                      {session.is_current && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">This device</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ip} · {session.location} · {timeAgo(session.last_active)}
                    </p>
                  </div>
                </div>
                {!session.is_current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => revokeSessionMutation.mutate(session.id)}
                    disabled={revokeSessionMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Login History */}
      <Card className="card-pharma">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Clock className="w-5 h-5 text-primary" /> Login History
          </CardTitle>
          <CardDescription>Recent login attempts on your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loginHistory.map((event) => (
            <div
              key={event.id}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                event.success
                  ? 'bg-muted/30 border-border/40'
                  : 'bg-destructive/5 border-destructive/20'
              }`}
            >
              <div className="flex items-center gap-3">
                {event.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm text-foreground">
                    {event.success ? 'Successful login' : 'Failed attempt'}
                    {event.failure_reason && (
                      <span className="text-xs text-destructive ml-2">— {event.failure_reason}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.device} · {event.ip} · {event.location}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(event.timestamp)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Login Email Alerts */}
      <LoginAlertSettings />

      {/* 2FA Setup Dialog */}
      <Dialog open={show2FASetup} onOpenChange={setShow2FASetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="2FA QR Code" className="w-48 h-48 rounded-xl border" />
            ) : (
              <div className="w-48 h-48 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50">
                <div className="text-center">
                  <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">QR code will appear here</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Generating…</p>
                </div>
              </div>
            )}
            {setupData.setup_uri && (
              <div className="w-full">
                <Label className="text-xs text-muted-foreground">
                  Manual entry key (if you cannot scan):
                </Label>
                <code className="block text-xs bg-muted p-2 rounded-lg mt-1 break-all text-foreground">
                  {setupData.setup_uri}
                </code>
              </div>
            )}
            <div className="w-full space-y-2">
              <Label htmlFor="totp-code">Verification Code</Label>
              <Input
                id="totp-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="h-12 text-center text-xl tracking-[0.5em] font-mono"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow2FASetup(false)}>Cancel</Button>
            <Button
              onClick={() => verify2FAMutation.mutate(totpCode)}
              disabled={totpCode.length !== 6 || verify2FAMutation.isPending}
            >
              {verify2FAMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA — password required */}
      <Dialog open={showDisable2FA} onOpenChange={setShowDisable2FA}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              This removes the second factor from your account. Confirm your password to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="disable-2fa-password">Password</Label>
            <Input
              id="disable-2fa-password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisable2FA(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => disable2FAMutation.mutate(disablePassword)}
              disabled={!disablePassword || disable2FAMutation.isPending}
            >
              {disable2FAMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Save Your Backup Codes</DialogTitle>
            <DialogDescription>
              Store these codes in a safe place. Each code can only be used once to sign in if you lose access to your authenticator app.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {backupCodes.map((code, i) => (
              <code key={i} className="text-sm bg-muted p-2 rounded-lg text-center font-mono text-foreground">
                {code}
              </code>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join('\n'));
                toast.success('Backup codes copied to clipboard');
              }}
            >
              Copy All
            </Button>
            <Button onClick={() => setShowBackupCodes(false)}>I've Saved These</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SecurityAuditPage;
