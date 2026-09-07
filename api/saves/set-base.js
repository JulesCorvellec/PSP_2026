import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';

const TABLE = 'psp_shared_imports';

// Réplique côté serveur l'ancien idbSetBase (un seul import "base" à la fois) : un seul aller-retour
// réseau pour le frontend au lieu d'orchestrer lui-même N appels GET/PUT.
export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id requis.' });

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from(TABLE).select('payload');
  if (error) return res.status(500).json({ error: 'Erreur serveur.' });

  const toUpdate = (data || [])
    .map((row) => row.payload)
    .filter((rec) => !!rec.estBase !== (rec.id === id))
    .map((rec) => Object.assign({}, rec, { estBase: rec.id === id }));

  for (const rec of toUpdate) {
    const { error: upErr } = await sb.from(TABLE).upsert({ id: rec.id, payload: rec, updated_at: new Date().toISOString() });
    if (upErr) return res.status(500).json({ error: 'Erreur serveur.' });
  }
  res.status(200).json({ ok: true });
}
