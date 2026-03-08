import { Link } from 'react-router-dom';
import { Pill, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Pill className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg text-foreground">PharmTrack</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="outline" asChild className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
            <Link to="/pharmacy/register">List Your Pharmacy</Link>
          </Button>
          <Button asChild>
            <Link to="/pharmacy/login">Login</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-3 flex flex-col gap-2 animate-fade-in">
          <Button variant="outline" asChild className="w-full border-primary text-primary">
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
