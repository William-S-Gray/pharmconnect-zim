import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

const PharmacyLoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Invalid email or password. Please try again.';
      toast.error(message);
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
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{
                background: 'linear-gradient(180deg, hsl(174 90% 30%) 0%, hsl(176 100% 17%) 100%)',
                boxShadow: '0 1px 0 0 rgba(255,255,255,0.25) inset, 0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              <Pill className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-heading font-bold text-xl text-emboss">Pharmacy Login</h1>
            <p className="text-sm text-muted-foreground">Sign in to manage your pharmacy</p>
          </div>

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
          </form>

          <p className="text-sm text-center text-muted-foreground mt-4">
            Don't have an account? <Link to="/pharmacy/register" className="text-primary hover:underline">Register free</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PharmacyLoginPage;
