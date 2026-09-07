import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

// Endpoint public (pas d'auth) : indique seulement si un compte existe déjà, pour que le frontend
// sache s'il doit afficher l'écran de connexion normal ou l'écran de création du premier compte
// administrateur (cf. /api/auth/bootstrap). Ne renvoie aucune information sensible.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });
  try {
    const sb = getSupabaseAdmin();
    const { count, error } = await sb.from('psp_users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    res.status(200).json({ hasUsers: (count || 0) > 0 });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}
