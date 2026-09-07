import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';

const TABLE = 'psp_geocode_cache';

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { keys } = req.body || {};
  if (!Array.isArray(keys) || !keys.length) return res.status(200).json({ results: {} });

  const sb = getSupabaseAdmin();
  const out = {};
  // .in() encode la liste de clés dans la requête : segmenté pour rester raisonnable sur un grand
  // parc (plusieurs centaines/milliers d'adresses distinctes), même logique que côté client avant.
  for (const chunk of chunkArray(Array.from(new Set(keys)), 300)) {
    try {
      const { data, error } = await sb.from(TABLE).select('key,lat,lon,label,score').in('key', chunk);
      if (error || !data) continue;
      data.forEach((row) => {
        out[row.key] = row.lat === null || row.lat === undefined ? null : { lat: row.lat, lon: row.lon, label: row.label, score: row.score };
      });
    } catch (e) {
      /* best-effort : une erreur sur un lot ne doit pas bloquer les autres */
    }
  }
  res.status(200).json({ results: out });
}
