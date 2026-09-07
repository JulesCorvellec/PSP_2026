import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { requireAdmin } from '../../_lib/auth.js';
import { hashPassword } from '../../_lib/passwords.js';

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const sb = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('psp_users')
      .select('id,email,is_admin,created_at')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Erreur serveur.' });
    return res.status(200).json({ users: data });
  }

  if (req.method === 'POST') {
    const { email, password, isAdmin } = req.body || {};
    if (!email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Email et mot de passe (8 caractères minimum) requis.' });
    }
    const password_hash = await hashPassword(password);
    const { data, error } = await sb
      .from('psp_users')
      .insert({ email: String(email).trim().toLowerCase(), password_hash, is_admin: !!isAdmin })
      .select('id,email,is_admin,created_at')
      .single();
    if (error) {
      if (String(error.code) === '23505') return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
    return res.status(201).json({ user: data });
  }

  res.status(405).json({ error: 'Méthode non autorisée.' });
}
