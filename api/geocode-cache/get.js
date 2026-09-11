import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuth } from '../_lib/auth.js';
import { requireMethod, withErrors } from '../_lib/http.js';

const TABLE = 'psp_geocode_cache';

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (!requireMethod(req, res, 'POST')) return;
  const { keys } = req.body || {};
  if (!Array.isArray(keys) || !keys.length) return res.status(200).json({ results: {} });

  const sb = getSupabaseAdmin();
  const out = {};
  // .in() encode la liste de clés dans la requête : segmenté pour rester raisonnable sur un grand
  // parc (plusieurs centaines/milliers d'adresses distinctes), même logique que côté client avant. Les
  // lots sont indépendants (aucune donnée partagée entre eux) : lancés en parallèle plutôt qu'attendus
  // un par un, pour ne pas payer N fois la latence d'un aller-retour réseau sur un grand parc.
  await Promise.all(
    chunkArray(Array.from(new Set(keys)), 300).map(async (chunk) => {
      try {
        const { data, error } = await sb.from(TABLE).select('key,lat,lon,label,score').in('key', chunk);
        if (error || !data) return;
        data.forEach((row) => {
          out[row.key] = row.lat === null || row.lat === undefined ? null : { lat: row.lat, lon: row.lon, label: row.label, score: row.score };
        });
      } catch (e) {
        /* best-effort : une erreur sur un lot ne doit pas bloquer les autres */
      }
    })
  );
  res.status(200).json({ results: out });
}

export default withErrors(handler);
