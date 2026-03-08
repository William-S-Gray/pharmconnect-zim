import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill, Shield, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const PharmacyLoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    try {
      setForgotLoading(true);
      await api.post('/api/auth/forgot-password', { email: forgotEmail });
      setForgotSent(true);
      toast.success('If that email is registered, a reset link has been sent.');
    } catch {
      // Always show success to prevent email enumeration
      setForgotSent(true);
      toast.success('If that email is registered, a reset link has been sent.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (error: any) {
      // Check if server requires 2FA
      if (error.response?.status === 403 && error.response?.data?.requires_2fa) {
        setRequires2FA(true);
        setTempToken(error.response.data.temp_token || '');
        toast.info('Enter your 2FA code to continue');
      } else {
        const message = error.response?.data?.error || 'Invalid email or password. Please try again.';
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    try {
      setIsLoading(true);
      const res = await api.post('/api/auth/2fa/verify', {
        temp_token: tempToken,
        code: totpCode,
      });
      // Complete login with the real token
      const { token, pharmacy } = res.data;
      localStorage.setItem('pharmtrack_token', token);
      localStorage.setItem('pharmtrack_pharmacy', JSON.stringify(pharmacy));
      // Force a page reload to pick up new auth state
      window.location.href = '/dashboard';
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Invalid 2FA code. Please try again.');
      setTotpCode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <div className="card-pharma w-full max-w-[420px]">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 brand-icon-skeu">
            {requires2FA ? (
              <Shield className="w-6 h-6 text-white" />
            ) : showForgot ? (
              <Mail className="w-6 h-6 text-white" />
            ) : (
              <Pill className="w-6 h-6 text-white" />
            )}
          </div>
          <h1 className="font-heading font-bold text-xl text-foreground text-emboss">
            {requires2FA ? 'Two-Factor Verification' : showForgot ? 'Reset Password' : 'Pharmacy Login'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {requires2FA
              ? 'Enter the 6-digit code from your authenticator app'
              : showForgot
              ? forgotSent ? 'Check your inbox for the reset link' : "Enter your email and we'll send a reset link"
              : 'Sign in to manage your pharmacy'}
          </p>
          </div>

          {requires2FA ? (
            <form onSubmit={handle2FAVerify} className="space-y-4">
              <div>
                <Label htmlFor="totp">Authentication Code</Label>
                <Input
                  id="totp"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="h-14 text-center text-2xl tracking-[0.5em] font-mono"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={isLoading || totpCode.length !== 6}>
                {isLoading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => {
                  setRequires2FA(false);
                  setTotpCode('');
                  setTempToken('');
                }}
              >
                ← Back to login
              </Button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" placeholder="pharmacy@example.com" />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11" />
                </div>
                <div className="text-right">
                  <button type="button" className="text-sm text-primary hover:underline">Forgot password?</button>
                </div>
                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => {
                    setEmail('demo@pharmtrack.co.zw');
                    setPassword('demo1234');
                  }}
                >
                  Use Demo Credentials
                </Button>
              </form>

              <p className="text-sm text-center text-muted-foreground mt-4">
                Don't have an account? <Link to="/pharmacy/register" className="text-primary hover:underline">Register free</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PharmacyLoginPage;
