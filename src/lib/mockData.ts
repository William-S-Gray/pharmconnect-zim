// Mock drug data for frontend development before Supabase is connected
export interface Drug {
  id: string;
  generic_name: string;
  common_name: string;
  brand_names: string[];
  strength: string;
  form: string;
  category: string;
  is_controlled: boolean;
  search_terms: string[];
}

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  suburb: string;
  city: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  is_open_24h: boolean;
  operating_hours?: Record<string, string>;
}

export interface PharmacyStock {
  id: string;
  pharmacy_id: string;
  drug_id: string;
  quantity: number;
  unit_price: number | null;
  threshold: number;
  is_available: boolean;
  expiry_date: string | null;
}

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface SearchResult {
  pharmacy: Pharmacy;
  stock: PharmacyStock;
  drug: Drug;
  distanceKm: number;
  stockStatus: StockStatus;
}

export const mockDrugs: Drug[] = [
  { id: '1', generic_name: 'Paracetamol', common_name: 'Panadol', brand_names: ['Panadol','Tylenol','Disprin'], strength: '500mg', form: 'tablet', category: 'Pain Relief', is_controlled: false, search_terms: ['panadol','paracetamol','pcm','panado','tylenol'] },
  { id: '2', generic_name: 'Metformin Hydrochloride', common_name: 'Metformin', brand_names: ['Glucophage','Glumetza'], strength: '500mg', form: 'tablet', category: 'Diabetes', is_controlled: false, search_terms: ['metformin','glucophage','diabetes tablet'] },
  { id: '3', generic_name: 'Amoxicillin', common_name: 'Amoxil', brand_names: ['Amoxil','Amoxicot'], strength: '500mg', form: 'capsule', category: 'Antibiotic', is_controlled: false, search_terms: ['amoxicillin','amoxil','antibiotic'] },
  { id: '4', generic_name: 'Amlodipine Besylate', common_name: 'Amlodipine', brand_names: ['Norvasc','Amlodis'], strength: '5mg', form: 'tablet', category: 'Hypertension', is_controlled: false, search_terms: ['amlodipine','norvasc','blood pressure'] },
  { id: '5', generic_name: 'Omeprazole', common_name: 'Losec', brand_names: ['Losec','Prilosec','Omez'], strength: '20mg', form: 'capsule', category: 'Gastric', is_controlled: false, search_terms: ['omeprazole','losec','stomach tablet'] },
  { id: '6', generic_name: 'Atenolol', common_name: 'Tenormin', brand_names: ['Tenormin','Atenol'], strength: '50mg', form: 'tablet', category: 'Hypertension', is_controlled: false, search_terms: ['atenolol','tenormin','heart tablet'] },
  { id: '7', generic_name: 'Ciprofloxacin', common_name: 'Cipro', brand_names: ['Cipro','Ciproflox'], strength: '500mg', form: 'tablet', category: 'Antibiotic', is_controlled: false, search_terms: ['ciprofloxacin','cipro'] },
  { id: '8', generic_name: 'Ibuprofen', common_name: 'Brufen', brand_names: ['Brufen','Advil','Nurofen'], strength: '400mg', form: 'tablet', category: 'Pain Relief', is_controlled: false, search_terms: ['ibuprofen','brufen','advil','nurofen'] },
  { id: '9', generic_name: 'Metronidazole', common_name: 'Flagyl', brand_names: ['Flagyl','Metro'], strength: '400mg', form: 'tablet', category: 'Antibiotic', is_controlled: false, search_terms: ['metronidazole','flagyl'] },
  { id: '10', generic_name: 'Salbutamol', common_name: 'Ventolin', brand_names: ['Ventolin','Asthalin'], strength: '100mcg', form: 'inhaler', category: 'Respiratory', is_controlled: false, search_terms: ['salbutamol','ventolin','inhaler','asthma'] },
  { id: '11', generic_name: 'Lisinopril', common_name: 'Zestril', brand_names: ['Zestril','Prinivil'], strength: '10mg', form: 'tablet', category: 'Hypertension', is_controlled: false, search_terms: ['lisinopril','zestril'] },
  { id: '12', generic_name: 'Fluconazole', common_name: 'Diflucan', brand_names: ['Diflucan','Flucozole'], strength: '150mg', form: 'capsule', category: 'Antifungal', is_controlled: false, search_terms: ['fluconazole','diflucan'] },
  { id: '13', generic_name: 'Doxycycline', common_name: 'Vibramycin', brand_names: ['Vibramycin','Doxy'], strength: '100mg', form: 'capsule', category: 'Antibiotic', is_controlled: false, search_terms: ['doxycycline','vibramycin','doxy'] },
  { id: '14', generic_name: 'Hydrochlorothiazide', common_name: 'HCTZ', brand_names: ['HydroD','Dichlotride'], strength: '25mg', form: 'tablet', category: 'Hypertension', is_controlled: false, search_terms: ['hydrochlorothiazide','hctz','water tablet'] },
  { id: '15', generic_name: 'Ferrous Sulphate', common_name: 'Feosol', brand_names: ['Feosol','FeSO4'], strength: '200mg', form: 'tablet', category: 'Supplements', is_controlled: false, search_terms: ['ferrous sulphate','iron tablet','feosol'] },
  { id: '16', generic_name: 'Clotrimazole', common_name: 'Canesten', brand_names: ['Canesten','Clotri'], strength: '1%', form: 'cream', category: 'Antifungal', is_controlled: false, search_terms: ['clotrimazole','canesten'] },
  { id: '17', generic_name: 'Vitamin C', common_name: 'Ascorbic Acid', brand_names: ['Redoxon','VitC'], strength: '500mg', form: 'tablet', category: 'Supplements', is_controlled: false, search_terms: ['vitamin c','vit c','redoxon','ascorbic acid'] },
  { id: '18', generic_name: 'Diclofenac Sodium', common_name: 'Voltaren', brand_names: ['Voltaren','Diclofenac'], strength: '50mg', form: 'tablet', category: 'Pain Relief', is_controlled: false, search_terms: ['diclofenac','voltaren','pain killer'] },
  { id: '19', generic_name: 'Cotrimoxazole', common_name: 'Bactrim', brand_names: ['Bactrim','Septrin'], strength: '480mg', form: 'tablet', category: 'Antibiotic', is_controlled: false, search_terms: ['cotrimoxazole','bactrim','septrin'] },
  { id: '20', generic_name: 'Artemether/Lumefantrine', common_name: 'Coartem', brand_names: ['Coartem','AL tabs'], strength: '20/120mg', form: 'tablet', category: 'Antimalarial', is_controlled: false, search_terms: ['coartem','malaria tablet','artemether','lumefantrine'] },
];

export const mockPharmacies: Pharmacy[] = [
  { id: 'p1', name: 'Halsteads Pharmacy', address: '12 King George Rd', suburb: 'Avondale', city: 'Harare', lat: -17.7936, lng: 31.0418, phone: '0771234567', email: 'halsteads@example.com', status: 'APPROVED', plan_tier: 'BASIC', is_open_24h: false },
  { id: 'p2', name: 'OK Pharmacy CBD', address: '45 Samora Machel Ave', suburb: 'CBD', city: 'Harare', lat: -17.8292, lng: 31.0522, phone: '0772345678', email: 'ok@example.com', status: 'APPROVED', plan_tier: 'PRO', is_open_24h: true },
  { id: 'p3', name: 'Alpha Omega Pharmacy', address: '89 Jason Moyo Ave', suburb: 'CBD', city: 'Harare', lat: -17.8310, lng: 31.0480, phone: '0773456789', email: 'alpha@example.com', status: 'APPROVED', plan_tier: 'FREE', is_open_24h: false },
  { id: 'p4', name: 'MedPharm Borrowdale', address: '23 Borrowdale Rd', suburb: 'Borrowdale', city: 'Harare', lat: -17.7650, lng: 31.0800, phone: '0774567890', email: 'medpharm@example.com', status: 'APPROVED', plan_tier: 'BASIC', is_open_24h: false },
  { id: 'p5', name: 'QV Pharmacy Mutare', address: '5 Main St', suburb: 'City Centre', city: 'Mutare', lat: -18.9707, lng: 32.6709, phone: '0775678901', email: 'qv@example.com', status: 'APPROVED', plan_tier: 'BASIC', is_open_24h: false },
  { id: 'p6', name: 'HealthPlus Greendale', address: '67 Coronation Ave', suburb: 'Greendale', city: 'Harare', lat: -17.8100, lng: 31.1050, phone: '0776789012', email: 'healthplus@example.com', status: 'APPROVED', plan_tier: 'PRO', is_open_24h: false },
];

export const mockStock: (PharmacyStock & { pharmacy: Pharmacy; drug: Drug })[] = [
  { id: 's1', pharmacy_id: 'p1', drug_id: '2', quantity: 45, unit_price: 2.50, threshold: 10, is_available: true, expiry_date: '2025-12-01', pharmacy: mockPharmacies[0], drug: mockDrugs[1] },
  { id: 's2', pharmacy_id: 'p2', drug_id: '2', quantity: 8, unit_price: 2.20, threshold: 10, is_available: true, expiry_date: '2025-11-15', pharmacy: mockPharmacies[1], drug: mockDrugs[1] },
  { id: 's3', pharmacy_id: 'p3', drug_id: '2', quantity: 0, unit_price: 2.80, threshold: 10, is_available: false, expiry_date: null, pharmacy: mockPharmacies[2], drug: mockDrugs[1] },
  { id: 's4', pharmacy_id: 'p4', drug_id: '2', quantity: 120, unit_price: 2.40, threshold: 10, is_available: true, expiry_date: '2026-03-01', pharmacy: mockPharmacies[3], drug: mockDrugs[1] },
  { id: 's5', pharmacy_id: 'p6', drug_id: '2', quantity: 22, unit_price: 2.60, threshold: 10, is_available: true, expiry_date: '2025-10-20', pharmacy: mockPharmacies[5], drug: mockDrugs[1] },
  { id: 's6', pharmacy_id: 'p1', drug_id: '1', quantity: 200, unit_price: 1.20, threshold: 20, is_available: true, expiry_date: '2026-06-01', pharmacy: mockPharmacies[0], drug: mockDrugs[0] },
  { id: 's7', pharmacy_id: 'p2', drug_id: '1', quantity: 15, unit_price: 1.00, threshold: 20, is_available: true, expiry_date: '2026-01-15', pharmacy: mockPharmacies[1], drug: mockDrugs[0] },
  { id: 's8', pharmacy_id: 'p1', drug_id: '3', quantity: 30, unit_price: 3.50, threshold: 10, is_available: true, expiry_date: '2025-09-01', pharmacy: mockPharmacies[0], drug: mockDrugs[2] },
];

export function getStockStatus(quantity: number, threshold: number, isAvailable: boolean): StockStatus {
  if (!isAvailable || quantity === 0) return 'OUT_OF_STOCK';
  if (quantity <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function searchDrugs(query: string): Drug[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return mockDrugs.filter(drug =>
    drug.generic_name.toLowerCase().includes(q) ||
    drug.common_name.toLowerCase().includes(q) ||
    drug.brand_names.some(b => b.toLowerCase().includes(q)) ||
    drug.search_terms.some(t => t.includes(q))
  ).slice(0, 8);
}

export function searchStock(drugQuery: string, city?: string): (PharmacyStock & { pharmacy: Pharmacy; drug: Drug; distanceKm: number; stockStatus: StockStatus })[] {
  const q = drugQuery.toLowerCase();
  const results = mockStock
    .filter(s => {
      const drugMatch = s.drug.generic_name.toLowerCase().includes(q) ||
        s.drug.common_name.toLowerCase().includes(q) ||
        s.drug.brand_names.some(b => b.toLowerCase().includes(q)) ||
        s.drug.search_terms.some(t => t.includes(q));
      const cityMatch = !city || city === 'All' || s.pharmacy.city === city;
      return drugMatch && cityMatch;
    })
    .map(s => ({
      ...s,
      distanceKm: Math.round((Math.random() * 8 + 0.5) * 10) / 10,
      stockStatus: getStockStatus(s.quantity, s.threshold, s.is_available),
    }))
    .sort((a, b) => {
      const statusOrder = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };
      return statusOrder[a.stockStatus] - statusOrder[b.stockStatus] || a.distanceKm - b.distanceKm;
    });
  return results;
}
