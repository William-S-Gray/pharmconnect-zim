/**
 * Symptom → drug keyword expansion.
 *
 * This lived inside the find_nearby_pharmacies() PL/pgSQL body as a CASE
 * over a dozen ILIKE patterns. It is product knowledge, not query logic:
 * it changes when a pharmacist tells you people search for "running
 * stomach", and it needs to be readable and testable by whoever makes that
 * change. Neither is true of a CASE arm buried in a 90-line SQL function.
 *
 * Patterns are matched against the lowercased query as substrings, in
 * order, first match wins — so put the specific before the general
 * ("stomach pain" must precede the bare "pain").
 */
export const SYMPTOM_MAP = [
  {
    match: ['running stomach', 'diarrhoea', 'diarrhea', 'loose stool'],
    drugs: ['oral rehydration', 'loperamide', 'metronidazole', 'flagyl', 'ORS'],
  },
  {
    match: ['stomach pain', 'ulcer', 'heartburn', 'acid reflux', 'acid'],
    drugs: ['omeprazole', 'ranitidine', 'antacid', 'lansoprazole'],
  },
  { match: ['headache', 'head pain'], drugs: ['paracetamol', 'ibuprofen', 'aspirin'] },
  {
    match: ['fever', 'temperature', 'malaria'],
    drugs: ['paracetamol', 'coartem', 'artemether', 'quinine'],
  },
  {
    match: ['cough', 'cold', 'flu'],
    drugs: ['amoxicillin', 'dextromethorphan', 'bromhexine', 'cetirizine'],
  },
  {
    match: ['blood pressure', 'hypertension'],
    drugs: ['amlodipine', 'losartan', 'enalapril', 'hydrochlorothiazide'],
  },
  { match: ['diabetes', 'sugar'], drugs: ['metformin', 'glibenclamide', 'insulin'] },
  {
    match: ['infection', 'bacteria'],
    drugs: ['amoxicillin', 'ciprofloxacin', 'metronidazole'],
  },
  { match: ['cholesterol'], drugs: ['atorvastatin', 'simvastatin'] },
  // General pain last: "stomach pain" and "head pain" must reach their own
  // entries first, and both contain "pain".
  { match: ['pain', 'ache'], drugs: ['paracetamol', 'ibuprofen', 'diclofenac'] },
];

/**
 * Returns the expanded drug keywords for a symptom-style query, or an
 * empty array when the query looks like a drug name already.
 */
export function expandSymptoms(query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return [];
  for (const entry of SYMPTOM_MAP) {
    if (entry.match.some((pattern) => q.includes(pattern))) return entry.drugs;
  }
  return [];
}

/**
 * Classify what the user is asking for. Replaces the detect_search_intent()
 * RPC; the SPA uses it to decide whether to show the drug-information
 * panel or go straight to pharmacy results.
 */
export function detectIntent(query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return 'unknown';
  if (expandSymptoms(q).length > 0) return 'symptom';
  if (/\d+\s*(mg|ml|g|mcg|iu)\b/.test(q)) return 'drug_with_strength';
  return 'drug';
}
