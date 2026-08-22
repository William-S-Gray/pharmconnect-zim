import { useEffect, useState } from 'react';
import {
  FlaskConical, AlertTriangle, Info, BookOpen,
  Pill, ChevronDown, ChevronUp, ExternalLink, X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

// ─── Local fallback drug database (top Zimbabwean drugs) ────────────────────
const LOCAL_DRUG_INFO: Record<string, DrugInfo> = {
  metformin: {
    generic_name: 'Metformin Hydrochloride',
    common_name: 'Metformin',
    drug_class: 'Biguanide antidiabetic',
    category: 'Diabetes',
    uses: ['Type 2 diabetes mellitus', 'Insulin resistance', 'Prediabetes management', 'PCOS (off-label)'],
    dosage: 'Adults: 500 mg twice daily with meals, increasing to 850–1000 mg twice daily as tolerated. Maximum 2,550 mg/day in divided doses.',
    side_effects: ['Nausea (very common, usually temporary)', 'Diarrhoea', 'Abdominal discomfort', 'Metallic taste', 'Rarely: Lactic acidosis (serious)'],
    warnings: 'Do not use if you have kidney disease (eGFR <30), liver disease, or are having surgery/contrast imaging. Stop 48 hours before contrast dye procedures. Alcohol increases lactic acidosis risk.',
    interactions: ['Alcohol', 'Iodinated contrast media', 'Topiramate', 'Carbonic anhydrase inhibitors'],
    storage: 'Store below 25°C, away from moisture and light.',
    pregnancy: 'Consult doctor — may be used with caution in gestational diabetes.',
    controlled: false,
  },
  amoxicillin: {
    generic_name: 'Amoxicillin Trihydrate',
    common_name: 'Amoxicillin',
    drug_class: 'Aminopenicillin antibiotic',
    category: 'Antibiotic',
    uses: ['Bacterial respiratory tract infections', 'Ear, nose and throat infections', 'Urinary tract infections', 'Skin and soft tissue infections', 'Lyme disease (early)'],
    dosage: 'Adults: 500 mg every 8 hours or 875 mg every 12 hours for 5–14 days depending on infection. Children: 25–45 mg/kg/day in divided doses. Always complete the full course.',
    side_effects: ['Diarrhoea', 'Nausea', 'Rash', 'Yeast infections', 'Rarely: Severe allergic reaction (anaphylaxis)'],
    warnings: 'Inform your doctor if you are allergic to penicillin, cephalosporins, or any antibiotic. Do not stop taking early even if you feel better — incomplete courses promote resistance.',
    interactions: ['Warfarin', 'Methotrexate', 'Oral contraceptives (reduced efficacy)', 'Probenecid'],
    storage: 'Store below 25°C. Reconstituted suspension: refrigerate and use within 14 days.',
    pregnancy: 'Generally considered safe — consult your doctor.',
    controlled: false,
  },
  paracetamol: {
    generic_name: 'Acetaminophen / Paracetamol',
    common_name: 'Paracetamol',
    drug_class: 'Analgesic & Antipyretic',
    category: 'Pain Relief',
    uses: ['Mild to moderate pain (headache, toothache, muscle ache)', 'Fever reduction', 'Post-immunisation fever in children', 'Osteoarthritis pain'],
    dosage: 'Adults: 500–1000 mg every 4–6 hours as needed. Maximum 4,000 mg (8 standard tablets) per 24 hours. Children: Follow weight-based dosing — see package insert.',
    side_effects: ['Rare at therapeutic doses', 'Liver damage (in overdose or with alcohol)', 'Allergic reactions (rare)', 'Blood disorders (very rare)'],
    warnings: 'NEVER exceed 8 tablets (500 mg) per day. Many cold, flu, and combination medicines already contain paracetamol — check all labels to avoid double-dosing. Avoid alcohol. Reduce dose if you have liver disease.',
    interactions: ['Alcohol', 'Warfarin (high doses)', 'Carbamazepine', 'Isoniazid'],
    storage: 'Store below 25°C, keep dry.',
    pregnancy: 'Considered the safest painkiller in pregnancy — use the lowest effective dose for the shortest time.',
    controlled: false,
  },
  amlodipine: {
    generic_name: 'Amlodipine Besylate',
    common_name: 'Amlodipine',
    drug_class: 'Dihydropyridine calcium channel blocker',
    category: 'Hypertension / Heart',
    uses: ['Hypertension (high blood pressure)', 'Stable angina pectoris', 'Vasospastic angina (Prinzmetal\'s angina)', 'Coronary artery disease'],
    dosage: 'Adults: 5 mg once daily. May increase to 10 mg once daily after 7–14 days if needed. Take at the same time each day, with or without food. Elderly: Start at 2.5 mg.',
    side_effects: ['Ankle and foot swelling (oedema)', 'Flushing', 'Headache', 'Dizziness', 'Fatigue', 'Palpitations'],
    warnings: 'Do not stop taking suddenly without doctor advice. Grapefruit and grapefruit juice can significantly increase blood levels — avoid during treatment. Use with caution in severe aortic stenosis or acute heart failure.',
    interactions: ['Grapefruit juice', 'Cyclosporin', 'Tacrolimus', 'Simvastatin (high dose)', 'CYP3A4 inhibitors'],
    storage: 'Store below 30°C, protect from light and moisture.',
    pregnancy: 'Not recommended — discuss safer alternatives with your doctor.',
    controlled: false,
  },
  ciprofloxacin: {
    generic_name: 'Ciprofloxacin Hydrochloride',
    common_name: 'Ciprofloxacin',
    drug_class: 'Fluoroquinolone antibiotic',
    category: 'Antibiotic',
    uses: ['Urinary tract infections (UTI)', 'Respiratory tract infections', 'Typhoid fever', 'Gonorrhoea', 'Anthrax prophylaxis', 'Bone and joint infections'],
    dosage: 'Adults: 250–750 mg every 12 hours for 3–14 days depending on infection type. Take with a full glass of water. Do not take with dairy products or calcium-fortified foods.',
    side_effects: ['Nausea', 'Diarrhoea', 'Dizziness', 'Headache', 'Tendon rupture (rare but serious)', 'QT prolongation (rare)', 'Photosensitivity'],
    warnings: 'Can cause tendon damage, especially the Achilles tendon — stop immediately if you have tendon pain. Avoid excessive sun exposure (causes sunburn). Not recommended for children under 18 or pregnant women. Can worsen myasthenia gravis.',
    interactions: ['Antacids (reduce absorption — take 2 hrs apart)', 'Warfarin', 'Theophylline', 'NSAIDs', 'Dairy products (take 2 hrs apart)'],
    storage: 'Store below 25°C, protect from light.',
    pregnancy: 'Avoid — not recommended during pregnancy or breastfeeding.',
    controlled: false,
  },
  omeprazole: {
    generic_name: 'Omeprazole Magnesium',
    common_name: 'Omeprazole',
    drug_class: 'Proton pump inhibitor (PPI)',
    category: 'Gastrointestinal',
    uses: ['Gastric ulcers', 'Duodenal ulcers', 'GERD (acid reflux / heartburn)', 'Zollinger-Ellison syndrome', 'H. pylori eradication (with antibiotics)', 'Prevention of NSAID-induced ulcers'],
    dosage: 'Adults: 20–40 mg once daily, 30–60 minutes before the first meal. Take for 4–8 weeks for ulcers; may be long-term for GERD. Do not crush or chew capsules.',
    side_effects: ['Headache', 'Nausea', 'Abdominal pain', 'Diarrhoea or constipation', 'Long-term: Low magnesium, vitamin B12 deficiency, increased fracture risk'],
    warnings: 'Long-term use (>1 year) may cause magnesium and vitamin B12 deficiency — get periodic blood tests. May mask symptoms of stomach cancer — report persistent symptoms. Increased risk of C. difficile diarrhoea.',
    interactions: ['Clopidogrel (reduced efficacy)', 'Methotrexate', 'Atazanavir', 'Warfarin', 'Ketoconazole'],
    storage: 'Store below 25°C, protect from light and moisture.',
    pregnancy: 'Generally considered safe — consult doctor for prolonged use.',
    controlled: false,
  },
  losartan: {
    generic_name: 'Losartan Potassium',
    common_name: 'Losartan',
    drug_class: 'Angiotensin II receptor blocker (ARB)',
    category: 'Hypertension / Heart',
    uses: ['Hypertension (high blood pressure)', 'Diabetic nephropathy (kidney protection in type 2 diabetes)', 'Heart failure', 'Stroke prevention in hypertension with left ventricular hypertrophy'],
    dosage: 'Adults: 50 mg once daily (starting dose). May increase to 100 mg once daily. Elderly or volume-depleted: Start at 25 mg. Can be taken with or without food.',
    side_effects: ['Dizziness', 'Low blood pressure (first dose)', 'High potassium levels', 'Impaired kidney function (rare)', 'Dry cough (less common than ACE inhibitors)'],
    warnings: 'Do not use during pregnancy — can cause serious fetal harm or death. Do not combine with ACE inhibitors or aliskiren (risk of kidney failure and high potassium). Monitor kidney function and potassium levels regularly.',
    interactions: ['Potassium supplements', 'ACE inhibitors', 'NSAIDs', 'Lithium', 'Aliskiren'],
    storage: 'Store below 25°C, protect from light.',
    pregnancy: 'CONTRAINDICATED — do not use during pregnancy.',
    controlled: false,
  },
  ibuprofen: {
    generic_name: 'Ibuprofen',
    common_name: 'Ibuprofen',
    drug_class: 'Non-steroidal anti-inflammatory drug (NSAID)',
    category: 'Pain Relief / Anti-inflammatory',
    uses: ['Mild to moderate pain', 'Fever', 'Inflammation (arthritis, sprains)', 'Menstrual cramps', 'Dental pain', 'Headache and migraine'],
    dosage: 'Adults: 200–400 mg every 4–6 hours with food or milk. Maximum 1,200 mg/day OTC; up to 3,200 mg/day under medical supervision. Children: Use weight-based paediatric formulations only.',
    side_effects: ['Stomach upset (common — always take with food)', 'Nausea', 'Heartburn', 'Dizziness', 'Increased blood pressure', 'Kidney problems (with prolonged use)', 'Stomach ulcers and bleeding'],
    warnings: 'Always take with food or milk to protect the stomach. Avoid if you have a peptic ulcer, kidney disease, or heart failure. Increases risk of cardiovascular events with long-term use. Do not combine with other NSAIDs or aspirin. Avoid in the last trimester of pregnancy.',
    interactions: ['Aspirin', 'Warfarin', 'Lithium', 'Methotrexate', 'ACE inhibitors', 'SSRIs', 'Antihypertensives'],
    storage: 'Store below 25°C.',
    pregnancy: 'Avoid in the third trimester — may cause premature closure of ductus arteriosus.',
    controlled: false,
  },
  diclofenac: {
    generic_name: 'Diclofenac Sodium',
    common_name: 'Diclofenac',
    drug_class: 'Non-steroidal anti-inflammatory drug (NSAID)',
    category: 'Pain Relief / Anti-inflammatory',
    uses: ['Musculoskeletal pain (back pain, arthritis)', 'Post-operative pain', 'Migraine', 'Dysmenorrhoea (menstrual pain)', 'Acute gout', 'Dental pain'],
    dosage: 'Adults: 75–150 mg daily in 2–3 divided doses with food. Maximum 150 mg/day. Topical gel: Apply 2–4 g to the affected area 3–4 times daily. Use the lowest effective dose for the shortest time.',
    side_effects: ['Gastrointestinal upset', 'Nausea', 'Headache', 'Dizziness', 'Liver enzyme elevation', 'Fluid retention', 'Increased cardiovascular risk with long-term use'],
    warnings: 'Diclofenac has a higher cardiovascular risk among NSAIDs — avoid if you have heart disease. Take with food to reduce stomach irritation. Avoid combining with other NSAIDs. Monitor liver function with prolonged use.',
    interactions: ['Warfarin', 'Lithium', 'Cyclosporin', 'Methotrexate', 'Other NSAIDs', 'Antihypertensives'],
    storage: 'Store below 25°C, protect from moisture.',
    pregnancy: 'Avoid especially in third trimester.',
    controlled: false,
  },
  atorvastatin: {
    generic_name: 'Atorvastatin Calcium',
    common_name: 'Atorvastatin',
    drug_class: 'HMG-CoA reductase inhibitor (Statin)',
    category: 'Cholesterol / Heart',
    uses: ['Hypercholesterolaemia (high cholesterol)', 'Mixed dyslipidaemia', 'Prevention of cardiovascular events (heart attack, stroke)', 'Familial hypercholesterolaemia'],
    dosage: 'Adults: 10–20 mg once daily (starting dose). Dose may be adjusted to 10–80 mg once daily. Take at the same time daily, with or without food. Evening dosing maximises efficacy.',
    side_effects: ['Muscle pain or weakness (myalgia)', 'Headache', 'Nausea', 'Constipation', 'Diarrhoea', 'Raised liver enzymes', 'Rarely: Rhabdomyolysis (severe muscle breakdown)'],
    warnings: 'Stop immediately and contact a doctor if you develop unexplained muscle pain, tenderness, or weakness — this could indicate rhabdomyolysis. Avoid grapefruit juice. Avoid alcohol. Report any unusual liver symptoms (jaundice, dark urine).',
    interactions: ['Grapefruit juice', 'Cyclosporin', 'Gemfibrozil', 'Erythromycin', 'HIV protease inhibitors', 'Warfarin'],
    storage: 'Store below 25°C, protect from light and moisture.',
    pregnancy: 'CONTRAINDICATED during pregnancy and breastfeeding.',
    controlled: false,
  },
};

export interface DrugInfo {
  generic_name: string;
  common_name: string;
  drug_class: string;
  category: string;
  uses: string[];
  dosage: string;
  side_effects: string[];
  warnings: string;
  interactions: string[];
  storage: string;
  pregnancy: string;
  controlled: boolean;
}

interface DrugInfoPanelProps {
  drugQuery: string;
  drugId?: string;
  onClose?: () => void;
  compact?: boolean;
}

function matchLocalDrug(query: string): DrugInfo | null {
  if (!query) return null;
  const q = query.toLowerCase().replace(/\s+\d+mg.*$/i, '').trim();
  for (const [key, info] of Object.entries(LOCAL_DRUG_INFO)) {
    if (
      q.includes(key) ||
      key.includes(q) ||
      info.common_name.toLowerCase().includes(q) ||
      info.generic_name.toLowerCase().includes(q)
    ) {
      return info;
    }
  }
  return null;
}

export function DrugInfoPanel({ drugQuery, drugId, onClose, compact = false }: DrugInfoPanelProps) {
  const [info, setInfo] = useState<DrugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllSideEffects, setShowAllSideEffects] = useState(false);
  const [showInteractions, setShowInteractions] = useState(false);
  const [source, setSource] = useState<'db' | 'local' | null>(null);

  useEffect(() => {
    if (!drugQuery) return;

    const fetchInfo = async () => {
      setLoading(true);
      setShowAllSideEffects(false);
      setShowInteractions(false);

      // 1. Ask the catalogue. Only entries with reviewed clinical copy
      //    carry a dosage; the rest fall through to the local map below
      //    rather than rendering blank sections with the same authority.
      if (drugId) {
        try {
          const data = await api.drugs.get(drugId) as any;

          if (data && data.dosage) {
            setInfo({
              generic_name: data.generic_name || '',
              common_name: data.common_name || '',
              drug_class: data.drug_class || data.category || '',
              category: data.category || '',
              uses: Array.isArray(data.uses) ? data.uses : [],
              dosage: data.dosage || '',
              side_effects: Array.isArray(data.side_effects) ? data.side_effects : [],
              warnings: data.warnings || '',
              interactions: Array.isArray(data.interactions) ? data.interactions : [],
              storage: data.storage || 'Store below 25°C.',
              // Column names are `pregnancy` and `controlled`; the previous
              // code selected pregnancy_category and is_controlled, which
              // no migration ever defined.
              pregnancy: data.pregnancy || 'Consult your doctor.',
              controlled: data.controlled || false,
            });
            setSource('db');
            setLoading(false);
            return;
          }
        } catch {
          // fall through to local
        }
      }

      // 2. Fallback: local curated database
      const local = matchLocalDrug(drugQuery);
      setInfo(local);
      setSource(local ? 'local' : null);
      setLoading(false);
    };

    fetchInfo();
  }, [drugQuery, drugId]);

  if (loading) {
    return (
      <div className="card-pharma p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-3 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="card-pharma p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="font-heading font-semibold text-sm text-foreground">Drug Information</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          No detailed information available for <strong className="text-foreground">"{drugQuery}"</strong> yet.
          Search results above still show which pharmacies have it in stock.
        </p>
      </div>
    );
  }

  const visibleSideEffects = showAllSideEffects ? info.side_effects : info.side_effects.slice(0, 3);

  return (
    <div className="card-pharma overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2"
        style={{
          background: 'linear-gradient(180deg, hsl(174 90% 28%) 0%, hsl(174 100% 22%) 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset',
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading font-bold text-base text-white truncate">{info.common_name}</span>
            {info.controlled && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">Controlled</Badge>
            )}
            {source === 'local' && (
              <span className="text-[10px] text-white/60 font-normal shrink-0">curated info</span>
            )}
          </div>
          <p className="text-xs text-white/75 mt-0.5 truncate">{info.generic_name} · {info.drug_class}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors flex-shrink-0 mt-0.5"
            aria-label="Close drug info"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className={`divide-y divide-border ${compact ? 'text-xs' : 'text-sm'}`}>

        {/* Category badge */}
        <div className="px-4 py-2.5 flex items-center gap-2">
          <Pill className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-muted-foreground">Category:</span>
          <Badge variant="secondary" className="text-xs font-medium">{info.category}</Badge>
        </div>

        {/* Uses */}
        {info.uses.length > 0 && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="font-medium text-foreground">Used for</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {info.uses.map((use, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-full text-foreground"
                  style={{
                    background: 'linear-gradient(180deg, hsl(210 25% 96%) 0%, hsl(210 25% 91%) 100%)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 2px rgba(0,0,0,0.07)',
                    border: '1px solid hsl(214 20% 83%)',
                  }}
                >
                  {use}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dosage */}
        {info.dosage && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="font-medium text-foreground">Dosage guidance</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">{info.dosage}</p>
          </div>
        )}

        {/* Side effects */}
        {info.side_effects.length > 0 && (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="font-medium text-foreground">Side effects</span>
              </div>
              {info.side_effects.length > 3 && (
                <button
                  onClick={() => setShowAllSideEffects(v => !v)}
                  className="flex items-center gap-0.5 text-xs text-primary hover:underline"
                >
                  {showAllSideEffects ? 'Show less' : `+${info.side_effects.length - 3} more`}
                  {showAllSideEffects ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {visibleSideEffects.map((se, i) => (
                <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  {se}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {info.warnings && (
          <div className="px-4 py-3">
            <div
              className="rounded-lg p-3 flex gap-2.5"
              style={{
                background: 'linear-gradient(180deg, hsl(0 80% 97%) 0%, hsl(0 60% 95%) 100%)',
                border: '1px solid hsl(0 70% 88%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
              }}
            >
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 leading-relaxed">{info.warnings}</p>
            </div>
          </div>
        )}

        {/* Interactions toggle */}
        {info.interactions.length > 0 && (
          <div className="px-4 py-2.5">
            <button
              onClick={() => setShowInteractions(v => !v)}
              className="w-full flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg leading-none">⚡</span>
                <span className="font-medium text-foreground">Drug interactions</span>
                <Badge variant="outline" className="text-xs h-5 px-1.5">{info.interactions.length}</Badge>
              </div>
              {showInteractions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showInteractions && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {info.interactions.map((drug, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full border border-orange-200 bg-orange-50 text-orange-800"
                  >
                    {drug}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Storage + Pregnancy row */}
        <div className="px-4 py-2.5 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground font-medium mb-0.5">Storage</p>
            <p className="text-foreground">{info.storage}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium mb-0.5">Pregnancy</p>
            <p className="text-foreground">{info.pregnancy}</p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="px-4 py-2.5 bg-muted/30">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This information is for general reference only. Always consult a qualified pharmacist or doctor before taking any medication.
          </p>
        </div>
      </div>
    </div>
  );
}
