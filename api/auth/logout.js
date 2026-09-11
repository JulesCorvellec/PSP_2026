import { clearSessionCookie } from '../_lib/auth.js';
import { requireMethod, withErrors } from '../_lib/http.js';

async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

export default withErrors(handler);
