import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { verifyPassword, verifyAgainstDummy } from '../_lib/passwords.js';
import { signToken, setSessionCookie } from '../_lib/auth.js';
import { requireMethod, withErrors } from '../_lib/http.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
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
    // Incrément atomique côté base (une seule instruction UPDATE, cf. supabase_race_condition_fixes.sql)
    // plutôt qu'un lire-puis-écrire ici : des tentatives concurrentes sur le même compte ne doivent pas
    // pouvoir se lire mutuellement une valeur périmée et faire manquer le verrouillage après 5 échecs.
    await sb.rpc('psp_register_login_failure', {
      p_user_id: user.id,
      p_max_attempts: MAX_ATTEMPTS,
      p_lock_minutes: LOCK_MINUTES,
    });
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  if (user.failed_attempts || user.locked_until) {
    await sb.from('psp_users').update({ failed_attempts: 0, locked_until: null }).eq('id', user.id);
  }

  const token = signToken(user);
  setSessionCookie(res, token);
  res.status(200).json({ user: { id: user.id, email: user.email, isAdmin: user.is_admin } });
}

export default withErrors(handler);
