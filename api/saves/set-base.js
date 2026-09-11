import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';
import { requireMethod, withErrors } from '../_lib/http.js';

// Bascule l'import "base" en une seule instruction SQL atomique (cf. psp_set_base_save dans
// supabase_race_condition_fixes.sql) au lieu d'un select-toute-la-table + boucle d'upserts côté Node :
// deux appels concurrents (deux utilisateurs qui changent la base au même instant) ne doivent jamais
// pouvoir laisser deux imports base=true à la fois, ou aucun.
async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireMethod(req, res, 'POST')) return;
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id requis.' });

  const sb = getSupabaseAdmin();
  const { error } = await sb.rpc('psp_set_base_save', { p_id: id });
  if (error) return res.status(500).json({ error: 'Erreur serveur.' });
  res.status(200).json({ ok: true });
}

export default withErrors(handler);
