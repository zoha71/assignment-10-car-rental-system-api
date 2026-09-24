try {
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = require('ws');
  }
} catch (e) {
  // WebSocket polyfill fallback
}

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkEnv() {
  const missing = [];
  if (!supabaseUrl || supabaseUrl.includes('<your-project-ref>')) missing.push('SUPABASE_URL');
  if (!supabaseAnonKey || supabaseAnonKey === 'your_anon_or_publishable_key') missing.push('SUPABASE_ANON_KEY');
  if (!supabaseServiceRoleKey || supabaseServiceRoleKey === 'your_service_role_or_secret_key') missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    const errorMsg = `[Supabase Config Error] Missing or placeholder environment variables: ${missing.join(', ')}. Please update your .env file.`;
    return { valid: false, errorMsg };
  }
  return { valid: true };
}

const envCheck = checkEnv();
if (!envCheck.valid) {
  console.warn(`\x1b[33m⚠️  Warning: ${envCheck.errorMsg}\x1b[0m`);
}

/**
 * Admin Supabase client initialized with the Service Role Key.
 * Used for all database operations and Supabase Auth Admin tasks.
 * NOTE: Bypasses Row Level Security (RLS) - authorize requests in controller logic!
 */
const supabaseAdmin = envCheck.valid
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Creates a fresh, isolated Supabase client initialized with the Anon Key.
 * Used strictly for password authentication (signInWithPassword) to avoid mutating shared client auth state.
 */
function createAuthClient() {
  if (!envCheck.valid) {
    throw new Error(envCheck.errorMsg);
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

module.exports = {
  supabaseAdmin,
  createAuthClient,
  checkEnv,
};
