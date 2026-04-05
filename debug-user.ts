import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  console.log("Checking user 'graywilliamwiltino@gmail.com'...");
  
  // 1. Check auth.users
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === 'graywilliamwiltino@gmail.com');
  
  if (user) {
    console.log("Found in auth.users! ID:", user.id);
  } else {
    console.log("Not found in auth.users by list. Trying RPC or direct... error:", userError);
  }

  // 2. Check public.profiles
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('*').eq('email', 'graywilliamwiltino@gmail.com');
  console.log("Profiles results:", profiles);
  if (profileError) console.error("Profile error:", profileError);
  
  if (user) {
    const { data: profileById } = await supabase.from('profiles').select('*').eq('id', user.id);
    console.log("Profile by auth ID:", profileById);
  }
}

run().catch(console.error);
