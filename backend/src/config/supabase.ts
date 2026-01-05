import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPA_PROJECT_URL || '';
const supabaseKey = process.env.SUPA_SERVICE_KEY || ''; // Service Key needed for storage uploads if RLS is strict

export const supabase = createClient(supabaseUrl, supabaseKey);
