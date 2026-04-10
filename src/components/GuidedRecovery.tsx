import React from 'react';
import { Pill, Activity, ShieldAlert, ChevronRight, MessageCircle } from 'lucide-react';

interface GuidedRecoveryProps {
  query: string;
  onSuggestionSelect: (suggestion: string) => void;
}

export function GuidedRecovery({ query, onSuggestionSelect }: GuidedRecoveryProps) {
  const normalized = query.toLowerCase();

  // Basic conversation trees based on common complex inputs
  let assistanceContent = null;

  if (normalized.includes('back')) {
    assistanceContent = (
      <>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">🤔</span>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-sm text-foreground rounded-tl-sm w-fit max-w-[85%]">
            I can help with that. Can you tell me more about your back pain?
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-sm text-foreground rounded-tl-sm w-fit max-w-[85%] space-y-2">
            <p className="font-medium opacity-80">Where exactly is it and how severe?</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {['Lower back', 'Upper back', 'Severe pain', 'Mild pain', 'Muscle spasm'].map(opt => (
                <button
                  key={opt}
                  onClick={() => onSuggestionSelect(opt.toLowerCase().includes('pain') ? 'ibuprofen' : 'paracetamol')}
                  className="px-3 py-1.5 bg-background shadow-sm border border-border rounded-lg text-xs font-medium hover:border-primary transition-colors text-left"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  } else if (normalized.includes('period') || normalized.includes('cramp')) {
    assistanceContent = (
      <>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">💡</span>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-sm text-foreground rounded-tl-sm w-fit max-w-[85%]">
            Period cramps are common and can be effectively managed.
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-sm text-foreground rounded-tl-sm w-fit max-w-[85%] space-y-2">
            <p className="font-medium opacity-80">What are you experiencing?</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                 { label: 'Mild discomfort', drug: 'paracetamol' },
                 { label: 'Severe pain', drug: 'ibuprofen' }, 
                 { label: 'Nausea or dizziness', drug: 'metoclopramide' }
               ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => onSuggestionSelect(opt.drug)}
                  className="px-3 py-1.5 bg-background shadow-sm border border-border rounded-lg text-xs font-medium hover:border-primary transition-colors text-left"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  } else if (normalized.includes('ear') && normalized.includes('leak')) {
    assistanceContent = (
      <>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
            <span className="text-sm">⚠️</span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-sm text-amber-900 dark:text-amber-200 rounded-tl-sm w-fit max-w-[85%]">
            This may indicate an ear infection.
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-sm text-amber-900 dark:text-amber-200 rounded-tl-sm w-fit max-w-[85%] space-y-2">
            <ul className="list-disc pl-4 opacity-90 space-y-1 mb-3">
              <li>Absolutely avoid inserting any objects (like cotton swabs).</li>
              <li>Visit a clinic immediately if pain is severe.</li>
            </ul>
            <div className="flex flex-col gap-2 pt-1">
               <button
                 onClick={() => onSuggestionSelect('amoxicillin')}
                 className="flex justify-between items-center px-3 py-2 bg-background shadow-sm border border-border rounded-lg text-xs font-medium hover:border-primary transition-colors text-left text-foreground"
               >
                 Find Antibiotics (Prescription required) <ChevronRight className="w-3 h-3 opacity-50" />
               </button>
               <button
                 onClick={() => onSuggestionSelect('paracetamol')}
                 className="flex justify-between items-center px-3 py-2 bg-background shadow-sm border border-border rounded-lg text-xs font-medium hover:border-primary transition-colors text-left text-foreground"
               >
                 Painkillers for relief <ChevronRight className="w-3 h-3 opacity-50" />
               </button>
            </div>
          </div>
        </div>
      </>
    );
  } else {
    // Generic fallback for UNKNOWN
    assistanceContent = (
      <>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 border border-primary/20">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-sm text-foreground rounded-tl-sm w-fit max-w-[85%]">
            I'm your PharmConnect smart assistant. I couldn't find an exact match for what you described. 
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 border border-primary/20">
            <span className="text-sm">💊</span>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-sm text-foreground rounded-tl-sm w-fit max-w-[85%] space-y-2">
            <p className="font-medium opacity-80">Are you looking for any of these common reliefs?</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                 { label: 'Pain Relief', drug: 'paracetamol' },
                 { label: 'Cold & Flu', drug: 'cetirizine' }, 
                 { label: 'Stomach Ache', drug: 'omeprazole' }
               ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => onSuggestionSelect(opt.drug)}
                  className="px-3 py-1.5 bg-background shadow-sm border border-border rounded-lg text-xs font-medium hover:border-primary transition-colors text-left"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto py-6 px-2 animate-fade-in">
      <div className="flex items-center gap-2 mb-6 px-1">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Smart Assistant Active</span>
      </div>

      <div className="space-y-1">
        {/* User bubble simulated */}
        <div className="flex gap-3 mb-4 justify-end">
          <div className="bg-secondary text-secondary-foreground rounded-2xl p-3 text-sm rounded-tr-sm w-fit max-w-[85%] shadow-sm">
            {query}
          </div>
        </div>

        {/* AI bubbles */}
        {assistanceContent}
      </div>

      <div className="mt-6 pt-4 border-t border-border flex justify-center">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest opacity-60">PharmConnect AI Assistant</p>
      </div>
    </div>
  );
}
