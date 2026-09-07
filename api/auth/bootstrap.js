import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { hashPassword } from '../_lib/passwords.js';
import { signToken, setSessionCookie } from '../_lib/auth.js';

// Crée le tout premier compte (administrateur) — n'accepte de le faire QUE si la table des
// utilisateurs est encore vide, pour ne jamais devenir une porte dérobée de création de compte une
// fois l'outil réellement en service (ensuite, seule la partie Administration, réservée aux admins,
// peut créer de nouveaux comptes).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { email, password } = req.body || {};
  if (!email || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Email et mot de passe (8 caractères minimum) requis.' });
  }
  const sb = getSupabaseAdmin();
  const { count, error: countErr } = await sb.from('psp_users').select('id', { count: 'exact', head: true });
  if (countErr) return res.status(500).json({ error: 'Erreur serveur.' });
  if ((count || 0) > 0) {
    return res.status(409).json({ error: 'Un compte existe déjà : utilisez la page de connexion.' });
  }
  const password_hash = await hashPassword(password);
  const { data, error } = await sb
    .from('psp_users')
    .insert({ email: String(email).trim().toLowerCase(), password_hash, is_admin: true })
    .select('id,email,is_admin')
    .single();
  if (error) return res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  const token = signToken(data);
  setSessionCookie(res, token);
  res.status(200).json({ user: { id: data.id, email: data.email, isAdmin: data.is_admin } });
}
