import React, { useEffect, useState } from 'react';
import { Brain, Pill, ChevronRight, AlertCircle, Lightbulb, Search } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

// ─── Local fallback (used if Supabase symptom_drug_map table not yet seeded) ──
const LOCAL_SYMPTOM_MAP: Record<string, { drugs: string[]; tip: string; emoji: string }> = {
  'running stomach':  { drugs: ['ORS', 'Loperamide', 'Metronidazole'],           tip: 'ORS prevents dehydration — the most important first step.',                 emoji: '🤢' },
  'diarrhoea':        { drugs: ['ORS', 'Loperamide', 'Metronidazole'],           tip: 'Stay hydrated with ORS while you recover.',                                 emoji: '🤢' },
  'diarrhea':         { drugs: ['ORS', 'Loperamide', 'Metronidazole'],           tip: 'Stay hydrated with ORS while you recover.',                                 emoji: '🤢' },
  'headache':         { drugs: ['Paracetamol', 'Ibuprofen', 'Aspirin'],          tip: 'Paracetamol 500mg is the first-line recommendation for headaches.',          emoji: '🤕' },
  'fever':            { drugs: ['Paracetamol', 'Coartem', 'Artemether'],         tip: 'Any fever in Zimbabwe should be evaluated for malaria. Get a rapid test.',   emoji: '🌡️' },
  'malaria':          { drugs: ['Coartem', 'Artemether', 'Quinine'],             tip: 'Malaria must be confirmed by a rapid test before treatment.',                emoji: '🦟' },
  'cough':            { drugs: ['Amoxicillin', 'Bromhexine', 'Cetirizine'],      tip: 'Most coughs are viral — antibiotics are not always needed.',                 emoji: '😮‍💨' },
  'blood pressure':   { drugs: ['Amlodipine', 'Losartan', 'Enalapril'],          tip: 'Blood pressure medication requires a doctor\'s prescription.',               emoji: '❤️' },
  'diabetes':         { drugs: ['Metformin', 'Glibenclamide', 'Insulin'],        tip: 'Diabetes medication requires a prescription.',                               emoji: '🩸' },
  'stomach pain':     { drugs: ['Omeprazole', 'Antacid', 'Ranitidine'],          tip: 'If pain is severe or persistent, see a doctor immediately.',                 emoji: '🤢' },
  'pain':             { drugs: ['Paracetamol', 'Ibuprofen', 'Diclofenac'],       tip: 'Paracetamol is the safest first-line pain reliever.',                        emoji: '😣' },
  'infection':        { drugs: ['Amoxicillin', 'Ciprofloxacin', 'Metronidazole'],tip: 'Antibiotics require a prescription. Never self-prescribe.',                  emoji: '🦠' },
  'cholesterol':      { drugs: ['Atorvastatin', 'Simvastatin'],                  tip: 'Statins require a prescription and regular liver function monitoring.',       emoji: '💊' },
  'cold':             { drugs: ['Cetirizine', 'Bromhexine', 'Paracetamol'],      tip: 'Cold symptoms usually resolve within 7–10 days without antibiotics.',        emoji: '🤧' },
  'flu':              { drugs: ['Paracetamol', 'Cetirizine', 'Amoxicillin'],     tip: 'Rest and fluids are key. Paracetamol relieves aches and fever.',             emoji: '🤧' },
};

function matchLocal(query: string): { drugs: string[]; tip: string; emoji: string } | null {
  const q = query.toLowerCase().trim();
  for (const [keyword, data] of Object.entries(LOCAL_SYMPTOM_MAP)) {
    if (q.includes(keyword)) return data;
  }
  return null;
}

interface SymptomMatch {
  drugs: string[];
  tip: string;
  emoji: string;
}

interface SmartEmptyStateProps {
  query: string;
  city?: string;
  onSearchSuggestion?: (suggestion: string) => void;
}

export function SmartEmptyState({ query, city = 'Harare', onSearchSuggestion }: SmartEmptyStateProps) {
  const [match, setMatch] = useState<SymptomMatch | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!query) { setLoaded(true); return; }

    const fetchSuggestions = async () => {
      // 1. Try Supabase symptom suggestions RPC
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.rpc('get_symptom_suggestions', { p_query: query });
          
          if (!error && data && data.length > 0) {
            const firstMatch = data[0];
            if (firstMatch.symptom_detected) {
              setMatch({ 
                drugs: firstMatch.suggested_drugs || [], 
                tip: firstMatch.tip || '', 
                emoji: '💊' // Default emoji as it's not in RPC
              });
              setLoaded(true);
              return;
            }
          }
        } catch (err) {
          console.warn('Symptom RPC failed:', err);
        }
      }
      
      // 2. Fallback to local map
      setMatch(matchLocal(query));
      setLoaded(true);
    };

    fetchSuggestions();
  }, [query]);

  if (!loaded) return null;

  if (match) {
    return (
      <div className="flex flex-col items-center py-8 px-4 animate-fade-in">
        <div
          className="w-full max-w-lg rounded-2xl overflow-hidden mb-4"
          style={{
            background: 'linear-gradient(135deg, hsl(174 90% 28%) 0%, hsl(210 80% 35%) 100%)',
            boxShadow: '0 4px 24px rgba(0,122,110,0.25), 0 1px 0 rgba(255,255,255,0.1) inset',
          }}
        >
          <div className="px-5 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
                {match.emoji}
              </div>
              <div>
                <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Symptom detected</p>
                <p className="text-white font-heading font-bold text-lg leading-tight">"{query}"</p>
              </div>
            </div>
            <p className="text-white/85 text-sm leading-relaxed">
              No exact drug match found, but based on your symptom, here are commonly used medications:
            </p>
          </div>
        </div>

        <div className="w-full max-w-lg space-y-2 mb-4">
          {match.drugs.map((drug) => (
            <button
              key={drug}
              onClick={() => onSearchSuggestion?.(drug)}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border hover:border-primary/40 transition-all group"
              style={{ background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted)/0.3) 100%)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Pill className="w-4 h-4 text-primary" />
                </div>
                <span className="font-medium text-foreground">{drug}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Search this</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </button>
          ))}
        </div>

        {match.tip && (
          <div
            className="w-full max-w-lg rounded-xl p-4 flex gap-3"
            style={{
              background: 'linear-gradient(180deg, hsl(45 100% 97%) 0%, hsl(45 80% 94%) 100%)',
              border: '1px solid hsl(45 70% 82%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
            }}
          >
            <Lightbulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 leading-relaxed">{match.tip}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
          Always consult a qualified pharmacist or doctor before taking any medication.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-10 px-4 text-center animate-fade-in">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'linear-gradient(180deg, hsl(var(--muted)) 0%, hsl(var(--muted)/0.5) 100%)', boxShadow: 'var(--shadow-card)' }}
      >
        <Search className="w-7 h-7 text-muted-foreground" />
      </div>
      <h2 className="font-heading font-semibold text-xl text-foreground mb-2">No results for "{query}"</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        We couldn't find <strong className="text-foreground">"{query}"</strong> near {city}. It might be a brand name or a spelling variation.
      </p>
      <div className="space-y-2 w-full max-w-sm">
        <div
          className="rounded-xl p-4 text-left flex gap-3"
          style={{ background: 'linear-gradient(180deg, hsl(210 25% 97%) 0%, hsl(210 20% 94%) 100%)', border: '1px solid hsl(214 20% 85%)' }}
        >
          <Brain className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Try these tips:</p>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>• Use the generic name (e.g. "paracetamol" not "Panado")</li>
              <li>• Describe your symptom (e.g. "headache" or "fever")</li>
              <li>• Check the spelling</li>
            </ul>
          </div>
        </div>
        {city && city !== 'Harare' && (
          <div
            className="rounded-xl p-3.5 flex items-center gap-3"
            style={{ background: 'linear-gradient(180deg, hsl(174 40% 97%) 0%, hsl(174 30% 94%) 100%)', border: '1px solid hsl(174 30% 83%)' }}
          >
            <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-sm text-foreground">
              Try searching in <strong>Harare</strong> — it has the largest pharmacy network.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
