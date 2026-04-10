import React, { useEffect, useState } from 'react';
import { Brain, Pill, ChevronRight, AlertCircle, Lightbulb, Search, ShieldAlert, LineChart } from 'lucide-react';
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
  'back':             { drugs: ['Ibuprofen', 'Diclofenac', 'Paracetamol'],       tip: 'If back pain is severe or accompanied by leg numbness, see a doctor immediately.', emoji: '💥' },
  'period':           { drugs: ['Ibuprofen', 'Paracetamol', 'Diclofenac'],       tip: 'NSAIDs like Ibuprofen are effective for menstrual cramps. A warm compress can also help.', emoji: '🩸' },
  'cramp':            { drugs: ['Ibuprofen', 'Paracetamol'],                     tip: 'For severe or persistent cramps, stay hydrated and consult a healthcare provider.', emoji: '😣' },
  'ear':              { drugs: ['Paracetamol', 'Ibuprofen'],                     tip: 'Ear leaks or infections require medical diagnosis. Do not insert objects into the ear.', emoji: '👂' },
  'tooth':            { drugs: ['Ibuprofen', 'Paracetamol', 'Metronidazole'],    tip: 'See a dentist for toothaches; painkillers only offer temporary relief.', emoji: '🦷' },
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

function isConversational(query: string): boolean {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  
  const conversationalPhrases = [
    'i have', 'am having', 'my', 'hurting', 'hurts', 'pain', 'feeling', 'feel',
    'leaking', 'ache', 'aching', 'how to', 'what is', 'is there', 'can i'
  ];
  return conversationalPhrases.some(phrase => q.includes(phrase));
}

import { useAuth } from '@/context/AuthContext';
import { RequestDrugModal } from '@/components/RequestDrugModal';

export function SmartEmptyState({ query, city = 'Harare', onSearchSuggestion }: SmartEmptyStateProps) {
  const { profile } = useAuth();
  const [match, setMatch] = useState<SymptomMatch | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  
  const isSuperAdmin = profile?.global_role === 'super_admin';

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
          <div className="w-full max-w-lg rounded-xl p-4 flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
            <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">{match.tip}</p>
          </div>
        )}

        <div className="w-full max-w-lg mt-5 rounded-2xl p-4 border border-dashed border-border flex flex-col items-center justify-center text-center gap-3">
           <p className="text-sm text-muted-foreground">
             Still didn't find what you're looking for?
           </p>
           <button
             onClick={() => setIsRequestModalOpen(true)}
             className="text-sm font-medium text-primary hover:underline"
           >
             Request a specific drug
           </button>
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
          Always consult a qualified pharmacist or doctor before taking any medication.
        </p>
        <RequestDrugModal 
          isOpen={isRequestModalOpen} 
          onClose={() => setIsRequestModalOpen(false)} 
          initialQuery={query}
          city={city}
        />
      </div>
    );
  }

  if (!match && isConversational(query)) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center animate-fade-in w-full max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-5 text-4xl shadow-sm border border-blue-100 dark:border-blue-900/50">
          🩺
        </div>
        <h2 className="font-heading font-semibold text-xl text-foreground mb-2">Let's find the right care for you</h2>
        <p className="text-sm text-muted-foreground mb-6">
          It sounds like you're describing how you feel. To help you better, please try using a simpler symptom keyword or drug name.
        </p>

        <div className="w-full bg-secondary/30 dark:bg-secondary/20 border border-secondary/50 dark:border-secondary/30 rounded-xl p-4 text-left shadow-sm">
           <p className="text-sm font-medium mb-3 text-foreground">Common keywords to try:</p>
           <div className="flex flex-wrap gap-2">
             {['pain', 'fever', 'cold', 'stomach', 'cough', 'running stomach', 'headache'].map((s) => (
                <button
                  key={s}
                  onClick={() => onSearchSuggestion?.(s)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border text-sm hover:border-primary transition-colors text-foreground shadow-sm"
                >
                  {s}
                </button>
             ))}
           </div>
        </div>

        <div className="mt-6 w-full rounded-xl p-4 flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200 text-left">
            <span className="font-semibold block mb-0.5">Medical Advice</span>
            PharmConnect cannot provide medical diagnoses. Please consult a doctor or visit a nearby pharmacy if your symptoms are severe or persistent.
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-border w-full flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-3 text-balance">
            Know the exact medicine you need?
          </p>
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="h-10 px-5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            Request a specific drug
          </button>
        </div>

        <RequestDrugModal 
          isOpen={isRequestModalOpen} 
          onClose={() => setIsRequestModalOpen(false)} 
          initialQuery={query}
          city={city}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-10 px-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-secondary/30 dark:bg-secondary/20 shadow-sm border border-secondary/50 dark:border-secondary/30">
        <LineChart className="w-7 h-7 text-muted-foreground" />
      </div>
      <h2 className="font-heading font-semibold text-xl text-foreground mb-2">Item not recognized</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        We ran an analysis but couldn't find a medicine or symptom matching <strong className="text-foreground">"{query}"</strong> in our system yet.
      </p>
      <div className="space-y-2 w-full max-w-sm">
        <div className="rounded-xl p-4 text-left flex gap-3 bg-secondary/30 dark:bg-secondary/20 border border-secondary/50 dark:border-secondary/30">
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
          <div className="rounded-xl p-3.5 flex items-center gap-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30">
            <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-sm text-foreground">
              Try searching in <strong>Harare</strong> — it has the largest pharmacy network.
            </p>
          </div>
        )}
        {isSuperAdmin && (
          <div
            className="rounded-xl p-3.5 flex items-center gap-3 border-dashed border-red-300 bg-red-50 text-red-800"
          >
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <div className="text-left text-xs">
              <p className="font-bold">ADMIN DIAGNOSTIC</p>
              <p className="opacity-90">Drugs exist in DB but no approved pharmacies have stock.</p>
              <p className="mt-1 font-semibold">• Check if your pharmacies are status='APPROVED'</p>
              <p className="font-semibold">• Verify stock quantity &gt; 0 in pharmacy_stock</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 pt-6 border-t border-border w-full max-w-sm flex flex-col items-center">
        <p className="text-sm text-muted-foreground mb-3 text-balance">
          Can't find a specific medicine? Let our partner pharmacies know so they can restock.
        </p>
        <button
          onClick={() => setIsRequestModalOpen(true)}
          className="h-10 px-5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
        >
          Request this Medicine
        </button>
      </div>

      <RequestDrugModal 
        isOpen={isRequestModalOpen} 
        onClose={() => setIsRequestModalOpen(false)} 
        initialQuery={query}
        city={city}
      />
    </div>
  );
}
