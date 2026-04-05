import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env');
}

// Create client only if URL is provided to avoid startup crash
// If missing, we export a proxy that will throw a descriptive error when used

declare global {
  interface Window {
    __supabaseClient?: any;
  }
}

let clientInstance: any;

if (supabaseUrl && supabaseAnonKey) {
  if (import.meta.env.DEV) {
    if (!window.__supabaseClient) {
      window.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    clientInstance = window.__supabaseClient;
  } else {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
} else {
  clientInstance = new Proxy({} as any, {
    get: (target, prop) => {
      throw new Error(`Supabase client error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Please check your .env file. Tried to access: ${String(prop)}`);
    }
  });
}

export const supabase = clientInstance;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
