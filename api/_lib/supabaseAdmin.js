import { createClient } from '@supabase/supabase-js';

// Client Supabase côté serveur UNIQUEMENT, utilisant la clé service_role (accès complet, contourne
// les policies RLS) — jamais exposée au frontend. Le frontend ne parle plus jamais directement à
// Supabase : tout passe par ce module, importé uniquement par les handlers /api/*.
let client = null;
export function getSupabaseAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configuration serveur manquante : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY doivent être définies dans les variables d'environnement du backend.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
