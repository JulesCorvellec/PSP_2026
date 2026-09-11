import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { hashPassword } from '../_lib/passwords.js';
import { signToken, setSessionCookie } from '../_lib/auth.js';
import { requireMethod, withErrors } from '../_lib/http.js';

// Crée le tout premier compte (administrateur) — n'accepte de le faire QUE si la table des
// utilisateurs est encore vide, pour ne jamais devenir une porte dérobée de création de compte une
// fois l'outil réellement en service (ensuite, seule la partie Administration, réservée aux admins,
// peut créer de nouveaux comptes).
async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  const { email, password } = req.body || {};
  if (!email || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Email et mot de passe (8 caractères minimum) requis.' });
  }
  const sb = getSupabaseAdmin();
  const password_hash = await hashPassword(password);
  // Vérification "table vide ?" + insertion faites atomiquement en une seule fonction SQL (verrou
  // transactionnel, cf. supabase_race_condition_fixes.sql) : deux appels concurrents à ce endpoint (non
  // authentifié par nature, tant qu'aucun compte n'existe) ne doivent jamais pouvoir créer chacun un
  // compte admin distinct.
  const { data, error } = await sb.rpc('psp_bootstrap_admin', {
    p_email: String(email).trim().toLowerCase(),
    p_password_hash: password_hash,
  });
  if (error) return res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  const created = Array.isArray(data) ? data[0] : data;
  if (!created) {
    return res.status(409).json({ error: 'Un compte existe déjà : utilisez la page de connexion.' });
  }
  const token = signToken(created);
  setSessionCookie(res, token);
  res.status(200).json({ user: { id: created.id, email: created.email, isAdmin: created.is_admin } });
}

export default withErrors(handler);
