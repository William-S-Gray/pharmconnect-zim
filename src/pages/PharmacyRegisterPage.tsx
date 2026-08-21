import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Pill, ArrowLeft, ArrowRight, Eye, EyeOff, CheckCircle2, MapPin, Phone, Building2, User, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PasswordStrengthMeter, isPasswordValid } from '@/components/PasswordStrengthMeter';
import { pharmacyRegisterSchema } from '@/lib/schemas';
import { GoogleMap, useJsApiLoader, Autocomplete, MarkerF, type Libraries } from '@react-google-maps/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// 'places' powers the address autocomplete on this form. The previous code
// referenced a LIBRARIES constant that was never declared anywhere.
const GOOGLE_MAPS_LIBRARIES: Libraries = ['places'];

const steps = [
  { id: 1, title: 'Your Pharmacy', icon: Building2 },
  { id: 2, title: 'Contact & Verification', icon: ShieldCheck },
  { id: 3, title: 'Your Account', icon: User },
  { id: 4, title: 'Review & Submit', icon: CheckCircle2 },
];

const mapContainerStyle = {
  width: '100%',
  height: '150px',
  borderRadius: '0.75rem',
  marginTop: '0.75rem',
};

const defaultCenter = { lat: -17.8292, lng: 31.0522 };

const PharmacyRegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', suburb: '', city: 'Harare',
    phone: '', email: '', mcazLicense: '',
    password: '', confirmPassword: '', agreedToTerms: false,
    lat: 0, lng: 0
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const onAutocompleteLoad = (autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current !== null) {
      const place = autocompleteRef.current.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        
        let suburb = '';
        let city = form.city;

        if (place.address_components) {
          for (const component of place.address_components) {
            if (component.types.includes('sublocality') || component.types.includes('neighborhood')) {
              suburb = component.long_name;
            }
            if (component.types.includes('locality')) {
              city = component.long_name;
            }
          }
        }

        setForm(prev => ({
          ...prev,
          address: place.formatted_address || '',
          suburb: suburb || prev.suburb,
          city: city || prev.city,
          lat,
          lng
        }));
      }
    }
  };

  const validateStep = () => {
    if (step === 1) {
      if (!form.name || !form.address || !form.suburb || !form.city) {
        toast.error('Please fill in all required pharmacy details');
        return false;
      }
    } else if (step === 2) {
      const zimPhoneRegex = /^(?:\+263|0)7[178]\d{7}$/;
      if (!zimPhoneRegex.test(form.phone.replace(/\s+/g, ''))) {
        toast.error('Please enter a valid Zimbabwe phone number (07X XXX XXXX)');
        return false;
      }
      if (!form.email || !form.email.includes('@')) {
        toast.error('Please enter a valid email address');
        return false;
      }
    } else if (step === 3) {
      if (!isPasswordValid(form.password)) {
        toast.error('Password does not meet security requirements');
        return false;
      }
      if (form.password !== form.confirmPassword) {
        toast.error('Passwords do not match');
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep()) setStep(s => Math.min(s + 1, 4));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 4) {
        nextStep();
        return;
    }
    
    if (!form.agreedToTerms) { toast.error('You must confirm the legal registration'); return; }

    try {
      setIsLoading(true);
      
      // Account, profile, pharmacy and membership are created together in
      // one transaction. The previous flow signed the user up and then
      // inserted the pharmacy separately, deliberately swallowing a failure
      // there — which left accounts with no pharmacy and no way to notice.
      // It also set pharmacies.id to the user's id and wrote latitude /
      // longitude, neither of which matches the schema.
      await api.auth.register({
        email: form.email,
        password: form.password,
        full_name: form.name,
        pharmacy: {
          name: form.name,
          email: form.email,
          address: form.address,
          suburb: form.suburb,
          city: form.city,
          phone: form.phone,
          mcaz_license: form.mcazLicense,
          lat: form.lat,
          lng: form.lng,
        } as any,
      });

      // The administrator alert is sent by the server as part of
      // registration. It used to be fired from here, which meant it only
      // happened when the client remembered to — and never at all for
      // anyone registering by any other route.

      toast.success('Registration successful! Your pharmacy is pending approval.');
      navigate('/dashboard');
    } catch (error: any) {
      // 409 is the server's "this email already has an account".
      if (error?.status === 409) {
        setShowDuplicateModal(true);
        return;
      }
      toast.error(error.message || 'Registration failed. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-xl">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 group">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to home
        </Link>

        {/* Progress Indicator */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            {steps.map((s, i) => (
              <div key={s.id} className="flex flex-col items-center flex-1 relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
                  step >= s.id ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted text-muted-foreground'
                }`}>
                  <s.icon className="w-5 h-5" />
                </div>
                {i < steps.length - 1 && (
                  <div className={`absolute h-[2px] w-full left-1/2 top-5 -z-0 ${
                    step > s.id ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
                <span className={`text-[10px] uppercase tracking-wider font-bold mt-2 ${
                  step >= s.id ? 'text-primary' : 'text-muted-foreground'
                }`}>Step {s.id}</span>
              </div>
            ))}
          </div>
          <h2 className="text-center font-heading font-bold text-lg text-foreground mt-2">
            {steps[step - 1].title}
          </h2>
        </div>

        <div className="card-pharma shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${(step / steps.length) * 100}%` }}
            />
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="name">Pharmacy Name *</Label>
                  <Input 
                    id="name" 
                    value={form.name} 
                    onChange={e => setForm({...form, name: e.target.value})} 
                    placeholder="Enter official pharmacy name"
                    className="h-11 shadow-sm" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Physical Address *</Label>
                  {isLoaded ? (
                    <Autocomplete
                      onLoad={onAutocompleteLoad}
                      onPlaceChanged={onPlaceChanged}
                      options={{ componentRestrictions: { country: 'zw' } }}
                    >
                      <Input 
                        id="address" 
                        value={form.address} 
                        onChange={e => setForm({...form, address: e.target.value})} 
                        placeholder="Search for your location..."
                        className="h-11 shadow-sm"
                      />
                    </Autocomplete>
                  ) : (
                    <Input 
                        id="address" 
                        value={form.address} 
                        onChange={e => setForm({...form, address: e.target.value})} 
                        placeholder="Enter full address"
                        className="h-11 shadow-sm"
                    />
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="suburb">Suburb *</Label>
                    <Input id="suburb" value={form.suburb} onChange={e => setForm({...form, suburb: e.target.value})} className="h-11 shadow-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>City *</Label>
                    <Select value={form.city} onValueChange={v => setForm({...form, city: v})}>
                      <SelectTrigger className="h-11 shadow-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Harare">Harare</SelectItem>
                        <SelectItem value="Bulawayo">Bulawayo</SelectItem>
                        <SelectItem value="Mutare">Mutare</SelectItem>
                        <SelectItem value="Gweru">Gweru</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.lat !== 0 && (
                  <div className="animate-in zoom-in duration-300">
                    <Label>Location Preview</Label>
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={{ lat: form.lat, lng: form.lng }}
                      zoom={15}
                      options={{ disableDefaultUI: true, gestureHandling: 'none' }}
                    >
                      <MarkerF position={{ lat: form.lat, lng: form.lng }} />
                    </GoogleMap>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        id="phone" 
                        value={form.phone} 
                        onChange={e => setForm({...form, phone: e.target.value})} 
                        placeholder="07X XXX XXXX" 
                        className="h-11 pl-10 shadow-sm" 
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1">Zimbabwe format: +263 or 07X</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email Address *</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={form.email} 
                    onChange={e => setForm({...form, email: e.target.value})} 
                    placeholder="pharmacy@example.com"
                    className="h-11 shadow-sm" 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="mcaz">MCAZ Licence Number</Label>
                    {form.mcazLicense && (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                            Verified Format
                        </Badge>
                    )}
                  </div>
                  <Input 
                    id="mcaz" 
                    value={form.mcazLicense} 
                    onChange={e => setForm({...form, mcazLicense: e.target.value})} 
                    placeholder="MCAZ-XXXX-XX" 
                    className="h-11 shadow-sm" 
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/30 p-2.5 rounded-lg border border-border/50">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    MCAZ licence speeds up approval by 48hrs
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative mt-1">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"} 
                      value={form.password} 
                      onChange={e => setForm({...form, password: e.target.value})} 
                      className="h-11 pr-10 shadow-sm" 
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
                
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase">
                    <span className="bg-background px-2 text-muted-foreground font-bold tracking-widest">Or strictly via</span>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  type="button" 
                  className="w-full h-11 flex items-center justify-center gap-3 skeu-inset hover:bg-muted/30"
                  onClick={() => { window.location.href = api.auth.googleSignInUrl(); }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                    />
                  </svg>
                  Register with Google
                </Button>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input 
                    id="confirmPassword" 
                    type={showPassword ? "text" : "password"} 
                    value={form.confirmPassword} 
                    onChange={e => setForm({...form, confirmPassword: e.target.value})} 
                    className="h-11 shadow-sm" 
                  />
                </div>

                <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 space-y-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Security Tips</p>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                    <li>Use at least 8 characters</li>
                    <li>Include a mix of letters, numbers, and symbols</li>
                    <li>Avoid using your pharmacy name as a password</li>
                  </ul>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-3 bg-muted/30 rounded-xl p-5 border border-border/50 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Pharmacy:</span>
                    <span className="font-semibold">{form.name}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-semibold">{form.suburb}, {form.city}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Contact:</span>
                    <span className="font-semibold">{form.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-semibold">{form.email}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                  <Checkbox 
                    id="terms" 
                    checked={form.agreedToTerms} 
                    onCheckedChange={(v) => setForm({...form, agreedToTerms: v === true})}
                    className="mt-1"
                  />
                  <Label htmlFor="terms" className="text-sm leading-tight cursor-pointer">
                    I confirm this pharmacy is legally registered in Zimbabwe and all provided information is accurate.
                  </Label>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={prevStep} className="flex-1 h-12 btn-skeu-outline">
                  Back
                </Button>
              )}
              <Button type="submit" className="flex-1 h-12 btn-skeu-primary" disabled={isLoading}>
                {isLoading ? 'Processing...' : step === 4 ? 'Complete Registration' : (
                    <span className="flex items-center gap-2">Next Step <ArrowRight className="w-4 h-4" /></span>
                )}
              </Button>
            </div>
          </form>

          <p className="text-sm text-center text-muted-foreground p-6 bg-muted/10 border-t">
            Already registered? <Link to="/login" className="text-primary font-bold hover:underline">Sign in</Link>
          </p>
        </div>
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
  );
};

export default PharmacyRegisterPage;
