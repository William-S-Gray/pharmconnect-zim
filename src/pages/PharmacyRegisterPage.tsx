import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Pill, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

const PharmacyRegisterPage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', suburb: '', city: 'Harare',
    phone: '', email: '', mcazLicense: '',
    password: '', confirmPassword: '', agreedToTerms: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agreedToTerms) { toast.error('You must agree to the terms'); return; }
    if (form.password !== form.confirmPassword) { toast.error("Passwords don't match"); return; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }

    try {
      setIsLoading(true);
      await api.post('/api/auth/register', {
        name: form.name,
        address: form.address,
        suburb: form.suburb,
        city: form.city,
        phone: form.phone,
        email: form.email,
        password: form.password,
        mcaz_license: form.mcazLicense,
      });
      toast.success('Registration received! Our team will verify your pharmacy within 24 hours.');
      navigate('/pharmacy/login');
    } catch (error: any) {
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        toast.error('Unable to connect to the server. Please check your internet connection and try again.');
      } else {
        const serverMsg = error.response?.data?.error || '';
        if (serverMsg.toLowerCase().includes('mcaz') || serverMsg.toLowerCase().includes('licence') || serverMsg.toLowerCase().includes('license') || serverMsg.toLowerCase().includes('duplicate')) {
          toast.error('This MCAZ Licence Number is already registered. Please check your licence number or contact support if you believe this is an error.');
        } else if (serverMsg.toLowerCase().includes('email')) {
          toast.error('This email address is already registered. Try signing in instead.');
        } else {
          toast.error(serverMsg || 'Registration failed. Please try again later.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="card-pharma">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center brand-icon-skeu">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-foreground text-emboss">Register Your Pharmacy</h1>
              <p className="text-sm text-muted-foreground">Join PharmTrack — it's free to list</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wide text-emboss">Pharmacy Information</h3>

            <div><Label htmlFor="name">Pharmacy Name *</Label><Input id="name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="h-11" /></div>
            <div><Label htmlFor="address">Physical Address *</Label><Input id="address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} required className="h-11" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="suburb">Suburb *</Label><Input id="suburb" value={form.suburb} onChange={e => setForm({...form, suburb: e.target.value})} required className="h-11" /></div>
              <div>
                <Label>City *</Label>
                <Select value={form.city} onValueChange={v => setForm({...form, city: v})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
            <div><Label htmlFor="phone">Phone Number *</Label><Input id="phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="07X XXX XXXX" required className="h-11" /></div>
            <div><Label htmlFor="email">Email Address *</Label><Input id="email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required className="h-11" /></div>

            <h3 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wide pt-2 text-emboss">Verification</h3>
            <div><Label htmlFor="mcaz">MCAZ Licence Number</Label><Input id="mcaz" value={form.mcazLicense} onChange={e => setForm({...form, mcazLicense: e.target.value})} placeholder="Optional but recommended" className="h-11" /></div>

            <h3 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wide pt-2 text-emboss">Account</h3>
            <div><Label htmlFor="password">Password *</Label><Input id="password" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required className="h-11" /></div>
            <div><Label htmlFor="confirmPassword">Confirm Password *</Label><Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})} required className="h-11" /></div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="terms" checked={form.agreedToTerms} onCheckedChange={(v) => setForm({...form, agreedToTerms: v === true})} />
              <Label htmlFor="terms" className="text-sm leading-tight">I confirm this pharmacy is legally registered in Zimbabwe</Label>
            </div>

            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register Pharmacy'}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-4">
            Already registered? <Link to="/pharmacy/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PharmacyRegisterPage;
