import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://tcqkklwqnhxziugtxghb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjcWtrbHdxbmh4eml1Z3R4Z2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDI4MDQsImV4cCI6MjA5MDg3ODgwNH0.kcWqO_2z4YTYp9ztoH_iRr83ru8Fq5Y2pvNC9jYW_5A');

async function run() {
  const email = 'william@test.com'; // random email
  
  console.log('Fetching profiles...');
  const { data: p } = await supabase.from('profiles').select('*').limit(5);
  console.log('profiles exist:', p ? p.length : 'error');

  console.log('Attempting upsert...');
  const { data, error } = await supabase.from('profiles').upsert({
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: email,
    full_name: 'Test',
    global_role: 'pharmacy_staff'
  }, { onConflict: 'id' });
  
  console.log('Result:', JSON.stringify(error) || 'Success');
}
run();
