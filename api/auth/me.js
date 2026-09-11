import { requireAuth } from '../_lib/auth.js';
import { requireMethod, withErrors } from '../_lib/http.js';

// Appelé par le frontend au chargement pour savoir si la session (cookie httpOnly) est encore
// valide, sans jamais avoir besoin de lire/décoder le token lui-même (impossible de toute façon,
// httpOnly). Un 401 ici = session absente ou expirée -> le frontend affiche l'écran de connexion.
async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const user = requireAuth(req, res);
  if (!user) return;
  res.status(200).json({ user: { id: user.sub, email: user.email, isAdmin: user.isAdmin } });
}

export default withErrors(handler);
