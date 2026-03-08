import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchDrugs, type Drug } from '@/lib/mockData';
import { useSearchStore } from '@/stores/searchStore';

interface DrugSearchBarProps {
  variant?: 'hero' | 'compact';
  initialQuery?: string;
  onSearch?: (query: string) => void;
}

export function DrugSearchBar({ variant = 'hero', initialQuery = '', onSearch }: DrugSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Drug[]>([]);
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
    debounceRef.current = setTimeout(() => {
      const found = searchDrugs(value);
      setResults(found);
      setIsOpen(found.length > 0);
    }, 300);
  };

  const handleSelect = (drug: Drug) => {
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
      <div className={`flex items-center gap-2 ${isHero ? 'bg-card rounded-xl p-1.5 shadow-lg' : ''}`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder="Search medicine name..."
            className={`pl-10 border-0 bg-transparent focus-visible:ring-0 ${isHero ? 'h-12 text-base' : 'h-10'}`}
          />
        </div>
        <Button onClick={handleSubmit} className={isHero ? 'h-10 px-6 rounded-lg' : 'h-9 px-4'}>
          Search
        </Button>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-fade-in">
          {results.map((drug, index) => (
            <button
              key={drug.id}
              onClick={() => handleSelect(drug)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors ${
                index === selectedIndex ? 'bg-muted' : ''
              } ${index !== results.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div>
                <p className="font-medium text-sm text-foreground">{drug.common_name} <span className="font-mono-drug text-xs text-muted-foreground">{drug.strength}</span></p>
                <p className="text-xs text-muted-foreground">{drug.generic_name} · {drug.form} · {drug.category}</p>
              </div>
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{drug.form}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
