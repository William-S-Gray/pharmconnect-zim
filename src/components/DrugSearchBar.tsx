import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSearchStore } from '@/stores/searchStore';
import { supabase } from '@/lib/supabaseClient';

interface Suggestion {
  id: string;
  common_name: string;
  generic_name: string;
  strength: string;
  form: string;
  category: string;
}

interface DrugSearchBarProps {
  variant?: 'hero' | 'compact';
  initialQuery?: string;
  onSearch?: (query: string) => void;
}

export function DrugSearchBar({ variant = 'hero', initialQuery = '', onSearch }: DrugSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();
  const { city } = useSearchStore();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('drugs')
          .select('id, common_name, generic_name, strength, form, category')
          .or(`common_name.ilike.%${value}%,generic_name.ilike.%${value}%`)
          .limit(6);
        
        if (error) throw error;
        const suggestions: Suggestion[] = data || [];
        setResults(suggestions);
        setIsOpen(suggestions.length > 0);
      } catch {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);
  };

  const handleSelect = (drug: Suggestion) => {
    const searchText = `${drug.common_name} ${drug.strength}`;
    setQuery(searchText);
    setIsOpen(false);
    if (onSearch) {
      onSearch(searchText);
    } else {
      navigate(`/search?drug=${encodeURIComponent(searchText)}&city=${city}`);
    }
  };

  const handleSubmit = () => {
    if (!query.trim()) return;
    setIsOpen(false);
    if (onSearch) {
      onSearch(query);
    } else {
      navigate(`/search?drug=${encodeURIComponent(query)}&city=${city}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isHero = variant === 'hero';

  return (
    <div ref={wrapperRef} className="relative w-full max-w-2xl mx-auto">
      <div
        className={`flex items-center gap-2 ${isHero ? 'rounded-xl p-1.5 hero-search-wrapper' : ''}`}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder="Search medicine name..."
            className={`pl-10 border-0 focus-visible:ring-0 text-foreground ${isHero ? 'h-12 text-base !bg-transparent !shadow-none' : ''}`}
          />
        </div>
        <Button onClick={handleSubmit} className={isHero ? 'h-10 px-6 rounded-lg' : 'h-9 px-4'}>
          Search
        </Button>
      </div>

      {isOpen && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 animate-fade-in border border-border"
          style={{
            background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 97%) 100%)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08), 0 1px 0 0 rgba(255,255,255,0.8) inset',
          }}
        >
          {results.map((drug, index) => (
            <button
              key={drug.id}
              onClick={() => handleSelect(drug)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                index === selectedIndex ? 'bg-primary/10' : 'hover:bg-muted/60'
              } ${index !== results.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div>
                <p className="font-medium text-sm text-foreground">{drug.common_name} <span className="font-mono-drug text-xs text-muted-foreground">{drug.strength}</span></p>
                <p className="text-xs text-muted-foreground">{drug.generic_name} · {drug.form} · {drug.category}</p>
              </div>
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: 'linear-gradient(180deg, hsl(210 20% 96%) 0%, hsl(210 20% 92%) 100%)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 2px rgba(0,0,0,0.06)',
                  border: '1px solid hsl(214 20% 85%)',
                  color: 'hsl(215 17% 47%)',
                }}
              >
                {drug.form}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
