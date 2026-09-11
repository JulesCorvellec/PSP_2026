import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireMethod, withErrors } from '../_lib/http.js';

// Endpoint public (pas d'auth) : indique seulement si un compte existe déjà, pour que le frontend
// sache s'il doit afficher l'écran de connexion normal ou l'écran de création du premier compte
// administrateur (cf. /api/auth/bootstrap). Ne renvoie aucune information sensible.
async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const sb = getSupabaseAdmin();
  const { count, error } = await sb.from('psp_users').select('id', { count: 'exact', head: true });
  if (error) return res.status(500).json({ error: 'Erreur serveur.' });
  res.status(200).json({ hasUsers: (count || 0) > 0 });
}

export default withErrors(handler);
