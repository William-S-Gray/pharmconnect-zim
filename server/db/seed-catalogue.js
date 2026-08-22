#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, closePool, transaction } from '../src/db.js';
import { SYMPTOM_MAP } from '../src/lib/symptoms.js';

/**
 * Seeds public.drugs.
 *
 * With the Supabase data abandoned, the catalogue starts empty — and an
 * empty catalogue means every search returns nothing, including symptom
 * searches, because the symptom map expands to drug names that must exist
 * to be found.
 *
 * Two tiers, deliberately kept apart:
 *
 *  - catalogue-clinical.json — the ten entries lifted out of
 *    DrugInfoPanel.tsx's LOCAL_DRUG_INFO map. That copy was already
 *    written and reviewed in this project, so it carries dosages,
 *    warnings and interactions.
 *
 *  - IDENTIFICATION_ONLY below — everything else the symptom map can
 *    return. These carry names, class, category and search terms and
 *    NOTHING clinical. Dosage and warning text is not invented here: a
 *    plausible-looking dose that nobody checked is worse than an absent
 *    one, because the UI presents it with the same authority as the
 *    reviewed entries. The drug information panel falls back to "no
 *    information available" for these, which is the correct outcome until
 *    a pharmacist supplies the copy.
 *
 * Brand names are the Zimbabwean ones people actually search for; without
 * them a search for "Panado" finds no paracetamol.
 *
 * Idempotent: re-running updates existing rows rather than duplicating.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

const IDENTIFICATION_ONLY = [
  { generic_name: 'Loperamide Hydrochloride', common_name: 'Loperamide',
    drug_class: 'Antimotility agent', category: 'Gastrointestinal',
    brand_names: ['Imodium'], search_terms: ['diarrhoea', 'running stomach', 'loose stool'] },

  { generic_name: 'Metronidazole', common_name: 'Metronidazole',
    drug_class: 'Nitroimidazole antibiotic', category: 'Antibiotic',
    brand_names: ['Flagyl'], search_terms: ['diarrhoea', 'infection', 'amoebiasis', 'giardia'] },

  { generic_name: 'Oral Rehydration Salts', common_name: 'ORS',
    drug_class: 'Electrolyte replacement', category: 'Gastrointestinal',
    brand_names: ['Rehidrat'], search_terms: ['ORS', 'dehydration', 'diarrhoea', 'running stomach'] },

  { generic_name: 'Artemether/Lumefantrine', common_name: 'Coartem',
    drug_class: 'Antimalarial combination', category: 'Antimalarial',
    brand_names: ['Coartem', 'Riamet'], search_terms: ['malaria', 'fever'] },

  { generic_name: 'Quinine Sulphate', common_name: 'Quinine',
    drug_class: 'Antimalarial', category: 'Antimalarial',
    brand_names: [], search_terms: ['malaria', 'fever'] },

  { generic_name: 'Dextromethorphan', common_name: 'Dextromethorphan',
    drug_class: 'Cough suppressant', category: 'Cough and cold',
    brand_names: ['Benylin'], search_terms: ['cough', 'cold', 'flu'] },

  { generic_name: 'Bromhexine Hydrochloride', common_name: 'Bromhexine',
    drug_class: 'Mucolytic', category: 'Cough and cold',
    brand_names: ['Bisolvon'], search_terms: ['cough', 'chest congestion', 'phlegm'] },

  { generic_name: 'Cetirizine Hydrochloride', common_name: 'Cetirizine',
    drug_class: 'Second-generation antihistamine', category: 'Allergy',
    brand_names: ['Zyrtec', 'Texa'], search_terms: ['allergy', 'hay fever', 'cold', 'runny nose'] },

  { generic_name: 'Enalapril Maleate', common_name: 'Enalapril',
    drug_class: 'ACE inhibitor', category: 'Cardiovascular',
    brand_names: ['Renitec'], search_terms: ['blood pressure', 'hypertension'] },

  { generic_name: 'Hydrochlorothiazide', common_name: 'HCTZ',
    drug_class: 'Thiazide diuretic', category: 'Cardiovascular',
    brand_names: [], search_terms: ['blood pressure', 'hypertension', 'water tablet'] },

  { generic_name: 'Glibenclamide', common_name: 'Glibenclamide',
    drug_class: 'Sulfonylurea antidiabetic', category: 'Diabetes',
    brand_names: ['Daonil'], search_terms: ['diabetes', 'sugar'] },

  { generic_name: 'Insulin (Soluble)', common_name: 'Insulin',
    drug_class: 'Antidiabetic hormone', category: 'Diabetes',
    brand_names: ['Actrapid', 'Mixtard'], search_terms: ['diabetes', 'sugar', 'injection'] },

  { generic_name: 'Ranitidine Hydrochloride', common_name: 'Ranitidine',
    drug_class: 'H2-receptor antagonist', category: 'Gastrointestinal',
    brand_names: ['Zantac'], search_terms: ['ulcer', 'heartburn', 'acid', 'stomach pain'] },

  { generic_name: 'Lansoprazole', common_name: 'Lansoprazole',
    drug_class: 'Proton pump inhibitor', category: 'Gastrointestinal',
    brand_names: ['Zoton'], search_terms: ['ulcer', 'heartburn', 'acid', 'reflux'] },

  { generic_name: 'Aluminium/Magnesium Hydroxide', common_name: 'Antacid',
    drug_class: 'Antacid', category: 'Gastrointestinal',
    brand_names: ['Gaviscon', 'Maalox'], search_terms: ['antacid', 'heartburn', 'acid', 'indigestion'] },

  { generic_name: 'Simvastatin', common_name: 'Simvastatin',
    drug_class: 'HMG-CoA reductase inhibitor', category: 'Cardiovascular',
    brand_names: ['Zocor'], search_terms: ['cholesterol', 'lipids'] },

  { generic_name: 'Acetylsalicylic Acid', common_name: 'Aspirin',
    drug_class: 'NSAID / antiplatelet', category: 'Pain relief',
    brand_names: ['Disprin', 'Cardio Aspirin'], search_terms: ['headache', 'pain', 'blood thinner'] },
];

/** Brand names people search for, keyed by the entry's `common_name`. */
const BRANDS = {
  Paracetamol: ['Panado', 'Compral', 'Painamol', 'Calpol'],
  Ibuprofen: ['Brufen', 'Nurofen', 'Adco-Ibuprofen'],
  Amoxicillin: ['Amoxil', 'Betamox'],
  Metformin: ['Glucophage', 'Diaformin'],
  Amlodipine: ['Norvasc', 'Amloc'],
  Ciprofloxacin: ['Cipro', 'Ciprobay'],
  Omeprazole: ['Losec', 'Omez'],
  Losartan: ['Cozaar', 'Losacar'],
  Diclofenac: ['Voltaren', 'Cataflam'],
  Atorvastatin: ['Lipitor', 'Atorlip'],
};

/** Symptom words that should find a given drug, derived from SYMPTOM_MAP. */
function symptomTermsFor(commonName, genericName) {
  const needle = (commonName ?? genericName).toLowerCase();
  const terms = new Set();
  for (const entry of SYMPTOM_MAP) {
    if (entry.drugs.some((d) => d.toLowerCase() === needle)) {
      for (const phrase of entry.match) terms.add(phrase);
    }
  }
  return [...terms];
}

async function main() {
  const clinical = JSON.parse(
    await readFile(path.join(here, 'catalogue-clinical.json'), 'utf8'),
  );

  const rows = [];

  for (const entry of Object.values(clinical)) {
    rows.push({
      generic_name: entry.generic_name,
      common_name: entry.common_name,
      drug_class: entry.drug_class ?? null,
      category: entry.category ?? null,
      brand_names: BRANDS[entry.common_name] ?? [],
      search_terms: symptomTermsFor(entry.common_name, entry.generic_name),
      uses: entry.uses ?? [],
      side_effects: entry.side_effects ?? [],
      interactions: entry.interactions ?? [],
      dosage: entry.dosage ?? null,
      warnings: entry.warnings ?? null,
      storage: entry.storage ?? null,
      pregnancy: entry.pregnancy ?? null,
      controlled: entry.controlled ?? false,
    });
  }

  for (const entry of IDENTIFICATION_ONLY) {
    rows.push({
      generic_name: entry.generic_name,
      common_name: entry.common_name,
      drug_class: entry.drug_class ?? null,
      category: entry.category ?? null,
      brand_names: entry.brand_names ?? [],
      // Union of the hand-written terms and anything the symptom map
      // implies, so the two stay in step when SYMPTOM_MAP changes.
      search_terms: [...new Set([
        ...(entry.search_terms ?? []),
        ...symptomTermsFor(entry.common_name, entry.generic_name),
      ])],
      uses: [], side_effects: [], interactions: [],
      dosage: null, warnings: null, storage: null, pregnancy: null,
      controlled: false,
    });
  }

  const written = await transaction(async (client) => {
    let n = 0;
    for (const r of rows) {
      await client.query(
        `INSERT INTO drugs
           (generic_name, common_name, drug_class, category, brand_names, search_terms,
            uses, side_effects, interactions, dosage, warnings, storage, pregnancy, controlled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (generic_name) DO UPDATE SET
           common_name  = EXCLUDED.common_name,
           drug_class   = EXCLUDED.drug_class,
           category     = EXCLUDED.category,
           brand_names  = EXCLUDED.brand_names,
           search_terms = EXCLUDED.search_terms,
           uses         = EXCLUDED.uses,
           side_effects = EXCLUDED.side_effects,
           interactions = EXCLUDED.interactions,
           dosage       = EXCLUDED.dosage,
           warnings     = EXCLUDED.warnings,
           storage      = EXCLUDED.storage,
           pregnancy    = EXCLUDED.pregnancy,
           controlled   = EXCLUDED.controlled`,
        [r.generic_name, r.common_name, r.drug_class, r.category, r.brand_names, r.search_terms,
         r.uses, r.side_effects, r.interactions, r.dosage, r.warnings, r.storage,
         r.pregnancy, r.controlled],
      );
      n += 1;
    }
    return n;
  });

  const { rows: [summary] } = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE dosage IS NOT NULL)::int AS with_clinical
       FROM drugs`);

  console.info(`[seed] catalogue: ${written} upserted, ${summary.total} total, ` +
               `${summary.with_clinical} with reviewed clinical copy`);
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
