import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Dashboard Supabase client (for authentication validation)
export const dashboardSupabase: SupabaseClient = createClient(
  process.env.DASHBOARD_SUPABASE_URL || '',
  process.env.DASHBOARD_SUPABASE_ANON_KEY || ''
);

// Math Plugin Supabase client (for CRUD operations)
export const mathPluginSupabase: SupabaseClient = createClient(
  process.env.MATH_SUPABASE_URL || '',
  process.env.MATH_SUPABASE_KEY || ''
);
