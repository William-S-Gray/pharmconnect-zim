import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function testLogin() {
  console.log("Attempting login...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'graywilliamwiltino@gmail.com',
    password: 'Will123!'
  });

  if (error) {
    console.error("Login Error:", error.message);
    return;
  }

  const user = data.user;
  console.log("Logged in! User ID:", user.id);

  console.log("Fetching profile from public.profiles...");
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (pError) {
    console.error("Profile Error:", pError.message);
  } else {
    console.log("Profile Data:", profile);
  }

  console.log("Testing RPC get_user_auth_data...");
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_auth_data', { p_user_id: user.id });
  if (rpcError) {
    console.error("RPC Error:", rpcError.message);
  } else {
    console.log("RPC Data:", JSON.stringify(rpcData, null, 2));
  }
}

testLogin();
