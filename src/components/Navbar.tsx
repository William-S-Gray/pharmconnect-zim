import { Link } from 'react-router-dom';
import { Pill, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 skeu-toolbar border-b">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(180deg, hsl(174 90% 30%) 0%, hsl(176 100% 17%) 100%)',
              boxShadow: '0 1px 0 0 rgba(255,255,255,0.25) inset, 0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            <Pill className="w-4 h-4 text-white" />
          </div>
          <span className="font-heading font-bold text-lg text-foreground text-emboss">PharmTrack</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/pharmacy/register">List Your Pharmacy</Link>
          </Button>
          <Button asChild>
            <Link to="/pharmacy/login">Login</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border px-4 py-3 flex flex-col gap-2 animate-fade-in" style={{ background: 'linear-gradient(180deg, hsl(0 0% 98%) 0%, hsl(210 20% 94%) 100%)' }}>
          <Button variant="outline" asChild className="w-full">
            <Link to="/pharmacy/register" onClick={() => setMobileOpen(false)}>List Your Pharmacy</Link>
          </Button>
          <Button asChild className="w-full">
            <Link to="/pharmacy/login" onClick={() => setMobileOpen(false)}>Login</Link>
          </Button>
        </div>
      )}
    </nav>
  );
}
