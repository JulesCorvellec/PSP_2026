import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { verifyPassword, verifyAgainstDummy } from '../_lib/passwords.js';
import { signToken, setSessionCookie } from '../_lib/auth.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

  const sb = getSupabaseAdmin();
  const normEmail = String(email).trim().toLowerCase();
  const { data: user, error } = await sb.from('psp_users').select('*').eq('email', normEmail).maybeSingle();
  if (error) return res.status(500).json({ error: 'Erreur serveur.' });

  if (!user) {
    await verifyAgainstDummy(password); // égalise le temps de réponse : pas d'énumération de comptes
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes.' });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const attempts = (user.failed_attempts || 0) + 1;
    const patch = { failed_attempts: attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
      patch.failed_attempts = 0;
    }
    await sb.from('psp_users').update(patch).eq('id', user.id);
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  if (user.failed_attempts || user.locked_until) {
    await sb.from('psp_users').update({ failed_attempts: 0, locked_until: null }).eq('id', user.id);
  }

  const token = signToken(user);
  setSessionCookie(res, token);
  res.status(200).json({ user: { id: user.id, email: user.email, isAdmin: user.is_admin } });
}
