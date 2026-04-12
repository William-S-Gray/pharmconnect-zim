import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function backfillH3() {
  console.log('🌍 Starting H3 Index Backfill (Resolution 8)...');

  // 1. Fetch all pharmacies with lat/lng but no h3_index
  const { data: pharmacies, error } = await supabase
    .from('pharmacies')
    .select('id, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error) {
    console.error('❌ Error fetching pharmacies:', error.message);
    return;
  }

  console.log(`🔍 Found ${pharmacies.length} pharmacies to process.`);

  for (const ph of pharmacies) {
    // Generate H3 index at Resolution 8 (roughly 1km hexagons)
    const h3Index = h3.latLngToCell(ph.lat, ph.lng, 8);
    
    console.log(`📍 Pharmacy ${ph.id}: [${ph.lat}, ${ph.lng}] -> ${h3Index}`);

    const { error: updateError } = await supabase
      .from('pharmacies')
      .update({ h3_index_res8: h3Index })
      .eq('id', ph.id);

    if (updateError) {
      console.error(`❌ Failed to update pharmacy ${ph.id}:`, updateError.message);
    }
  }

  console.log('✅ H3 Backfill Complete!');
}

backfillH3();
