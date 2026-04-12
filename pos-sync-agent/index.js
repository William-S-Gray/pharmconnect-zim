import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role for secure upserts
const PHARMACY_ID = process.env.PHARMACY_ID; // The specific pharmacy this agent belongs to
const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH || './mock_pos.db';
const POLL_INTERVAL_MS = 2000;

if (!SUPABASE_URL || !SUPABASE_KEY || !PHARMACY_ID) {
  console.error('❌ Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PHARMACY_ID).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const db = new Database(LOCAL_DB_PATH);

// Helper to setup mock tables if they don't exist
function setupMockDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Insert dummy data if empty
    INSERT INTO local_inventory (drug_name, quantity, unit_price)
    SELECT 'Paracetamol 500mg', 100, 0.50
    WHERE NOT EXISTS (SELECT 1 FROM local_inventory WHERE drug_name = 'Paracetamol 500mg');
  `);
}

setupMockDatabase();
console.log(`✅ Connected to local POS DB at ${LOCAL_DB_PATH}`);

// Keep track of last sync time to only fetch changes
let lastSyncTime = new Date(0).toISOString();

async function syncInventory() {
  try {
    // 1. Read changed rows from local POS DB
    // In a real scenario with Pastel/CompuCare (SQL Server/MariaDB), we'd use CDC (Change Data Capture)
    // or trigger-based webhooks. For this SQLite PoC, we do a basic polling query.
    const stmt = db.prepare('SELECT * FROM local_inventory WHERE last_updated > ?');
    const changes = stmt.all(lastSyncTime);

    if (changes.length > 0) {
      console.log(`🔄 Found ${changes.length} inventory updates locally. Syncing to Cloud...`);
      
      const upsertPayload = changes.map((row) => ({
        pharmacy_id: PHARMACY_ID,
        drug_name_lower: row.drug_name.toLowerCase(), // we would normally map drug_id
        quantity: row.quantity,
        unit_price: row.unit_price,
        is_available: row.quantity > 0,
        // Calculate stock status based on pharmacy thresholds or default to 10
        stock_status: row.quantity > 10 ? 'IN_STOCK' : (row.quantity > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK')
      }));

      // 2. Push to Supabase
      // Assuming a simplistic upsert by pharmacy_id + drug_name
      // Normally we would invoke an RPC to normalize the drug_name -> drug_id
      const { error } = await supabase
        .from('pharmacy_stock')
        // In reality, this requires a unique constraint on (pharmacy_id, drug_id)
        // Here we just insert to a queue table or call an RPC
        .upsert(upsertPayload, { onConflict: 'pharmacy_id, drug_name_lower' }); 

      if (error) {
        throw error;
      }
      
      console.log('✅ Sync successful at', new Date().toISOString());
      
      // Update our watermark cursor
      lastSyncTime = new Date().toISOString();
    }
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  }
}

// Start continuous polling (Agent mode)
console.log(`🚀 Starting Zero-Click Sync Agent (Polling every ${POLL_INTERVAL_MS}ms)`);
setInterval(syncInventory, POLL_INTERVAL_MS);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Gracefully shutting down agent...');
  db.close();
  process.exit(0);
});
