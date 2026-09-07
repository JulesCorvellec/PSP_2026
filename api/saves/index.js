import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';

const TABLE = 'psp_shared_imports';

// Réplique exactement le comportement de idbGetAll/idbPut côté client, avant la migration : même
// table, même forme de ligne (id, payload jsonb, updated_at) — seul le point d'accès change (le
// frontend ne parle plus jamais directement à Supabase, cf. api/_lib/supabaseAdmin.js).
export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const sb = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await sb.from(TABLE).select('payload');
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    return res.status(200).json({ records: (data || []).map((row) => row.payload) });
  }

  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.id) return res.status(400).json({ error: 'Sauvegarde invalide.' });
    const { error } = await sb.from(TABLE).upsert({ id: record.id, payload: record, updated_at: new Date().toISOString() });
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Méthode non autorisée.' });
}
