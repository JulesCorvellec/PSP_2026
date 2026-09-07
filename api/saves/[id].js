import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';

const TABLE = 'psp_shared_imports';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const { id } = req.query;
  const sb = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await sb.from(TABLE).select('payload').eq('id', id).maybeSingle();
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    return res.status(200).json({ record: data ? data.payload : null });
  }

  if (req.method === 'DELETE') {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Méthode non autorisée.' });
}
