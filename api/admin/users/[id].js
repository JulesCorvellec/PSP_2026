import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { requireAdmin } from '../../_lib/auth.js';
import { hashPassword } from '../../_lib/passwords.js';
import { requireMethod, withErrors } from '../../_lib/http.js';

async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (!requireMethod(req, res, 'PATCH', 'DELETE')) return;
  const { id } = req.query;
  const sb = getSupabaseAdmin();

  if (req.method === 'PATCH') {
    const { isAdmin, password } = req.body || {};
    const patch = {};
    if (isAdmin !== undefined) {
      // Un admin ne peut pas se retirer lui-même ses propres droits — évite de se retrouver bloqué
      // hors de l'administration si c'est le seul admin restant.
      if (id === admin.sub && !isAdmin) {
        return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur.' });
      }
      patch.is_admin = !!isAdmin;
    }
    if (password) {
      if (String(password).length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum.' });
      patch.password_hash = await hashPassword(password);
      patch.failed_attempts = 0;
      patch.locked_until = null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Aucune modification fournie.' });
    patch.updated_at = new Date().toISOString();
    const { data, error } = await sb
      .from('psp_users')
      .update(patch)
      .eq('id', id)
      .select('id,email,is_admin,created_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    if (!data) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    return res.status(200).json({ user: data });
  }

  if (req.method === 'DELETE') {
    if (id === admin.sub) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    const { error } = await sb.from('psp_users').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    return res.status(200).json({ ok: true });
  }
}

export default withErrors(handler);
