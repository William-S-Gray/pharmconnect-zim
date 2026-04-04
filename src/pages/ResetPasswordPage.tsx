import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { PasswordStrengthMeter, isPasswordValid } from '@/components/PasswordStrengthMeter';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState(true);

  useEffect(() => {
    if (!token) setIsValidToken(false);
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error("Passwords don't match"); return; }
    if (!isPasswordValid(password)) { toast.error('Password does not meet all requirements'); return; }

    try {
      setIsLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsSuccess(true);
      toast.success('Password has been reset successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password. The link may have expired.');
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
              {isSuccess ? (
                <CheckCircle className="w-6 h-6 text-white" />
              ) : (
                <KeyRound className="w-6 h-6 text-white" />
              )}
            </div>
            <h1 className="font-heading font-bold text-xl text-foreground text-emboss">
              {isSuccess ? 'Password Reset' : 'Set New Password'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSuccess
                ? 'Your password has been updated successfully'
                : 'Enter your new password below'}
            </p>
          </div>

          {isSuccess ? (
            <div className="space-y-4">
              <Link to="/pharmacy/login">
                <Button className="w-full h-11">Sign In with New Password</Button>
              </Link>
            </div>
          ) : !isValidToken ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <Link to="/pharmacy/login">
                <Button variant="outline" className="w-full h-11 gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                />
                <PasswordStrengthMeter password={password} />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
              <Link to="/pharmacy/login" className="block">
                <Button type="button" variant="ghost" className="w-full text-sm gap-1">
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </Button>
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
