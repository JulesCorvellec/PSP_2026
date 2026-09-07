import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';

const TABLE = 'psp_geocode_cache';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { entries } = req.body || {};
  if (!Array.isArray(entries) || !entries.length) return res.status(200).json({ ok: true });

  // Deux résidences peuvent partager la même adresse normalisée : on ne garde qu'une entrée par clé
  // avant l'upsert (Postgres refuse un lot avec deux lignes en conflit sur la même clé), même
  // précaution que côté client avant la migration.
  const byKey = new Map();
  entries.forEach(({ key, result }) => { if (key) byKey.set(key, result); });
  const rows = Array.from(byKey, ([key, result]) => ({
    key,
    lat: result ? result.lat : null,
    lon: result ? result.lon : null,
    label: result ? result.label : null,
    score: result ? result.score : null,
    updated_at: new Date().toISOString(),
  }));

  const sb = getSupabaseAdmin();
  try {
    const { error } = await sb.from(TABLE).upsert(rows, { onConflict: 'key' });
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (e) {
    // best-effort : un échec d'écriture du cache partagé ne doit jamais bloquer l'utilisateur courant
    res.status(200).json({ ok: false });
  }
}
