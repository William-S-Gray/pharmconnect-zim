import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSearchStore } from '@/stores/searchStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

interface Suggestion {
  id: string;
  type: 'drug' | 'symptom';
  common_name: string;
  generic_name?: string;
  strength?: string;
  form?: string;
  category?: string;
  tip?: string;
  suggested_query?: string;
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
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
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
        const [drugsRes, symptomRes] = await Promise.all([
          supabase
            .from('drugs')
            .select('id, common_name, generic_name, strength, form, category')
            .or(`common_name.ilike.%${value}%,generic_name.ilike.%${value}%`)
            .limit(6),
          isSupabaseConfigured ? supabase.rpc('get_symptom_suggestions', { p_query: value }) : Promise.resolve({ data: null, error: null })
        ]);
        
        let newSuggestions: Suggestion[] = [];
        
        if (symptomRes.data && symptomRes.data.length > 0 && symptomRes.data[0].symptom_detected) {
          const s = symptomRes.data[0];
          newSuggestions.push({
            id: 'symptom-match',
            type: 'symptom',
            common_name: s.suggested_drugs ? s.suggested_drugs.join(', ') : 'Suggested treatment',
            tip: s.tip,
            suggested_query: s.suggested_query || value,
          });
        }
        
        if (drugsRes.data) {
          newSuggestions = [...newSuggestions, ...drugsRes.data.map(d => ({ ...d, type: 'drug' as const }))];
        }
        
        setResults(newSuggestions);
        setIsOpen(newSuggestions.length > 0);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
        setIsOpen(false);
      }
    }, 300);
  };

  const handleSelect = (drug: Suggestion) => {
    setIsOpen(false);
    if (drug.type === 'symptom') {
      setQuery(drug.suggested_query || query);
      if (onSearch) {
        onSearch(drug.suggested_query || query);
      } else {
        navigate(`/search?drug=${encodeURIComponent(drug.suggested_query || query)}&city=${city}`);
      }
    } else {
      const searchText = `${drug.common_name} ${drug.strength || ''}`.trim();
      setQuery(searchText);
      if (onSearch) {
        onSearch(searchText);
      } else {
        navigate(`/search?drug=${encodeURIComponent(searchText)}&city=${city}`);
      }
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
    <div ref={wrapperRef} className={`relative w-full max-w-2xl mx-auto ${isOpen ? 'z-50' : ''}`}>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden" aria-hidden="true" onClick={() => setIsOpen(false)} />
      )}
      
      <div
        className={`relative z-50 flex items-center gap-2 bg-background md:bg-transparent ${isHero ? 'rounded-xl p-1.5 hero-search-wrapper' : 'rounded-lg'}`}
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
          className="absolute top-[calc(100%+8px)] left-0 right-0 rounded-xl overflow-hidden z-50 animate-fade-in border border-border shadow-2xl max-h-[60vh] overflow-y-auto"
          style={{
            background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 97%) 100%)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1), 0 1px 0 0 rgba(255,255,255,0.8) inset',
            overscrollBehavior: 'contain'
          }}
        >
          {results.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={`w-full text-left px-4 py-3.5 flex items-center justify-between transition-colors ${
                index === selectedIndex ? 'bg-primary/5' : 'hover:bg-muted/60'
              } ${index !== results.length - 1 ? 'border-b border-border' : ''}`}
            >
              {item.type === 'symptom' ? (
                <div className="flex items-start gap-3 w-full">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-orange-600 text-lg leading-none">💡</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                      Symptom Match
                      <span className="text-[10px] uppercase font-bold tracking-wider text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">Smart</span>
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Suggested: <strong className="text-foreground">{item.common_name}</strong>
                    </p>
                    {item.tip && <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-1">{item.tip}</p>}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="font-medium text-sm text-foreground">{item.common_name} <span className="font-mono-drug text-xs text-muted-foreground">{item.strength}</span></p>
                    <p className="text-xs text-muted-foreground">{item.generic_name} · {item.form} · {item.category}</p>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold shrink-0"
                    style={{
                      background: 'linear-gradient(180deg, hsl(210 20% 96%) 0%, hsl(210 20% 92%) 100%)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 2px rgba(0,0,0,0.06)',
                      border: '1px solid hsl(214 20% 85%)',
                      color: 'hsl(215 17% 47%)',
                    }}
                  >
                    {item.form}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
