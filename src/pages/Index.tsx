import { Navbar } from '@/components/Navbar';
import { DrugSearchBar } from '@/components/DrugSearchBar';
import { CitySelector } from '@/components/CitySelector';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Search, MapPin, Phone, Building2, Pill, Activity } from 'lucide-react';

const stats = [
  { label: 'Pharmacies', value: '300+', icon: Building2 },
  { label: 'Medicines', value: '20+', icon: Pill },
  { label: 'Updates', value: 'Live', icon: Activity },
];

const steps = [
  { icon: Search, title: 'Search your medicine', description: 'Type any drug name, brand, or generic — we find it instantly.' },
  { icon: MapPin, title: 'See nearest pharmacies', description: 'View which pharmacies near you have it in stock, with prices.' },
  { icon: Phone, title: 'Call or visit', description: 'Get the phone number and directions — no signup required.' },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero — glossy gradient panel */}
      <section
        className="text-white"
        style={{
          background: 'linear-gradient(180deg, hsl(174 90% 28%) 0%, hsl(174 100% 22%) 40%, hsl(176 100% 15%) 100%)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <div className="container mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="font-heading font-bold text-3xl md:text-5xl leading-tight mb-4 max-w-3xl mx-auto" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            Find Your Medicine.<br />Right Now.
          </h1>
          <p className="text-white/80 text-base md:text-lg mb-8 max-w-xl mx-auto" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
            Search 300+ pharmacies in Harare & Mutare — see who has it in stock.
          </p>

          <DrugSearchBar variant="hero" />

          <div className="mt-4">
            <CitySelector />
          </div>
        </div>
      </section>

      {/* Stats bar — raised toolbar */}
      <section className="skeu-toolbar border-b">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-center gap-8 md:gap-16 flex-wrap">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 text-center">
                <stat.icon className="w-5 h-5 text-primary" />
                <div>
                  <span className="font-heading font-bold text-lg text-foreground text-emboss">{stat.value}</span>
                  <span className="text-sm text-muted-foreground ml-1">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — embossed step cards */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <h2 className="font-heading font-bold text-2xl md:text-3xl text-center text-foreground mb-12 text-emboss">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <div key={i} className="text-center card-pharma p-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 stat-icon-skeu">
                <step.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — recessed panel */}
      <section className="border-t border-border cta-section">
        <div className="container mx-auto px-4 py-12 md:py-16 text-center">
          <h2 className="font-heading font-bold text-2xl text-foreground mb-3 text-emboss">Are you a pharmacy?</h2>
          <p className="text-muted-foreground mb-6">List your pharmacy for free and reach patients searching for medicines near you.</p>
          <Button size="lg" asChild>
            <Link to="/pharmacy/register">Register Your Pharmacy</Link>
          </Button>
        </div>
      </section>

      {/* Footer — raised bar */}
      <footer className="skeu-toolbar border-t py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center brand-icon-skeu">
              <Pill className="w-3 h-3 text-white" />
            </div>
            <span className="font-heading font-semibold text-foreground text-emboss">PharmConnect Zim</span>
          </div>
          <p>© 2026 PharmConnect Zim. Helping Zimbabwe find medicine faster.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
