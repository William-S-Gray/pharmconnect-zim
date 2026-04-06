import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill, Shield, Mail, ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { loginSchema } from '@/lib/schemas';

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, pharmacy, isSuperAdmin, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 2FA state

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  
  useEffect(() => {
    const mode = searchParams.get('mode');
    const emailParam = searchParams.get('email');
    
    if (mode === 'forgot') {
      setShowForgot(true);
      if (emailParam) {
        setForgotEmail(emailParam);
      }
    } else if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  useEffect(() => {
    // If navigation should happen after state commit, do it here
    if (isSuperAdmin) {
      navigate('/admin');
    } else if (pharmacy) {
      navigate('/dashboard');
    } else if (user && !pharmacy && !isSuperAdmin) {
      setIsLoading(false);
      toast.error('No associated pharmacy or admin role found for this user.');
    }
  }, [pharmacy, isSuperAdmin, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);

      // 0. Validate input with Zod
      const validation = loginSchema.safeParse({ email, password });
      if (!validation.success) {
        const errorMsg = validation.error.errors[0]?.message || 'Invalid input';
        toast.error(errorMsg);
        setIsLoading(false);
        return;
      }

      performance.mark('login-start');
      
      await login(email, password);
      
      performance.mark('login-end');
      const measure = performance.measure('Login Duration', 'login-start', 'login-end');
      console.log(`Login took ${measure.duration.toFixed(2)}ms`);
      
      toast.success('Welcome back!');
      // Navigate is handled by the useEffect above once pharmacy state propagates
    } catch (error: any) {
      toast.error(error.message || 'Invalid email or password.');
      setIsLoading(false); // Only stop loading on error, let it spin until navigation if successful
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    // MFA verification logic would go here
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !captchaVerified) {
      if (!captchaVerified) toast.error('Please solve the security check first');
      return;
    }
    try {
      setForgotLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/pharmacy/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
      toast.success('If that email is registered, a reset link has been sent.');
    } catch (error: any) {
      setForgotSent(true);
      toast.success('If that email is registered, a reset link has been sent.');
    } finally {
      setForgotLoading(false);
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
            {requires2FA ? 'Two-Factor Verification' : showForgot ? 'Reset Password' : 'Login'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {requires2FA
              ? 'Enter the 6-digit code from your authenticator app'
              : showForgot
              ? forgotSent ? 'Check your inbox for the reset link' : "Enter your email and we'll send a reset link"
              : 'Sign in to your account'}
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
          ) : showForgot ? (
            forgotSent ? (
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-foreground">
                    We've sent a password reset link to <strong className="text-foreground">{forgotEmail}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Didn't receive it? Check your spam folder or try again.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => { setForgotSent(false); setForgotEmail(''); setCaptchaVerified(false); }}
                >
                  Try another email
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-sm gap-1"
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); setCaptchaVerified(false); }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <Label htmlFor="forgotEmail">Email Address</Label>
                  <Input
                    id="forgotEmail"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="h-11"
                    placeholder="pharmacy@example.com"
                    autoFocus
                  />
                </div>
                <MathCaptcha onVerified={setCaptchaVerified} />
                <Button type="submit" className="w-full h-11" disabled={forgotLoading || !captchaVerified}>
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-sm gap-1"
                  onClick={() => { setShowForgot(false); setForgotEmail(''); }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </Button>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" placeholder="pharmacy@example.com" />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"} 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      required 
                      className="h-11 pr-10" 
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowForgot(true)}>Forgot password?</button>
                </div>
                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
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

export default LoginPage;
