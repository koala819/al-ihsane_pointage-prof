import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.SUPABASE_URL
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour les routes API.')
}

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey)
