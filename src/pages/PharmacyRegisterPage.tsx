import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Pill, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { PasswordStrengthMeter, isPasswordValid } from '@/components/PasswordStrengthMeter';
import { pharmacyRegisterSchema } from '@/lib/schemas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const PharmacyRegisterPage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', suburb: '', city: 'Harare',
    phone: '', email: '', mcazLicense: '',
    password: '', confirmPassword: '', agreedToTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 0. Validate with Zod
    const validation = pharmacyRegisterSchema.safeParse(form);
    if (!validation.success) {
      const errorMsg = validation.error.errors[0]?.message || 'Invalid input';
      toast.error(errorMsg);
      return;
    }

    if (!form.agreedToTerms) { toast.error('You must agree to the terms'); return; }

    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured. Please check your .env file.');
      return;
    }

    try {
      setIsLoading(true);
      
      // Proceed with signUp
      performance.mark('signup-start');
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            name: form.name,
            city: form.city,
            mcaz_license: form.mcazLicense,
            role: 'pharmacy'
          }
        }
      });

      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          setShowDuplicateModal(true);
          return;
        }
        throw error;
      }
      
      // With email enumeration protection, user is returned but identities is empty if they already exist
      if (data.user && data.user.identities && data.user.identities.length === 0) {
          setShowDuplicateModal(true);
          return;
      }

      performance.mark('signup-end');
      const measure = performance.measure('Signup Duration', 'signup-start', 'signup-end');
      console.log(`Signup took ${measure.duration.toFixed(2)}ms`);

      if (data.user) {
        toast.success('Registration successful! Please check your email for a confirmation link.');
        navigate('/login');
      }
    } catch (error: any) {
      toast.error(error.message || 'Registration failed. Please try again later.');
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
              <p className="text-sm text-muted-foreground">Join PharmConnect Zim — it's free to list</p>
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
            <div>
              <Label htmlFor="password">Password *</Label>
              <div className="relative mt-1">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  value={form.password} 
                  onChange={e => setForm({...form, password: e.target.value})} 
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
              <PasswordStrengthMeter password={form.password} />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <div className="relative mt-1">
                <Input 
                  id="confirmPassword" 
                  type={showPassword ? "text" : "password"} 
                  value={form.confirmPassword} 
                  onChange={e => setForm({...form, confirmPassword: e.target.value})} 
                  required 
                  className="h-11 pr-10" 
                />
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="terms" checked={form.agreedToTerms} onCheckedChange={(v) => setForm({...form, agreedToTerms: v === true})} />
              <Label htmlFor="terms" className="text-sm leading-tight">I confirm this pharmacy is legally registered in Zimbabwe</Label>
            </div>

            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register Pharmacy'}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-4">
            Already registered? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-heading text-emboss">Account Already Exists</DialogTitle>
            <DialogDescription className="pt-2">
              The email <strong className="text-foreground">{form.email}</strong> is already associated with a pharmacy account.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center text-sm text-muted-foreground">
            Would you like to sign in to your existing account or reset your password if you've forgotten it?
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 h-11"
              onClick={() => navigate(`/login?email=${encodeURIComponent(form.email)}`)}
            >
              Sign In
            </Button>
            <Button 
              type="button" 
              className="flex-1 h-11"
              onClick={() => navigate(`/login?mode=forgot&email=${encodeURIComponent(form.email)}`)}
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
  );
};

export default PharmacyRegisterPage;
