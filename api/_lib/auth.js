import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'psp_session';
const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12h, cf. exigence "token valable 12 heures"

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("Configuration serveur manquante : JWT_SECRET doit être défini dans les variables d'environnement du backend.");
  return s;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, isAdmin: !!user.is_admin },
    getSecret(),
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (e) {
    return null; // signature invalide OU expiré (jwt.verify lève dans les deux cas) — dans tous les
    // cas, le front doit être renvoyé vers la page de login (cf. requireAuth ci-dessous).
  }
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function getTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

function cookieParts(value, maxAgeSeconds) {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const parts = [
    COOKIE_NAME + '=' + encodeURIComponent(value),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + maxAgeSeconds,
  ];
  // Secure exige HTTPS : omis en dev local (http://localhost) sinon le navigateur rejette le cookie.
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', cookieParts(token, TOKEN_TTL_SECONDS));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookieParts('', 0));
}

// Renvoie le payload décodé du token si présent et valide, sinon null — ne répond jamais elle-même
// (laisse requireAuth/requireAdmin ci-dessous décider du code HTTP à renvoyer).
export function getAuthUser(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Non authentifié ou session expirée.' });
    return null;
  }
  return user;
}

export function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Accès administrateur requis.' });
    return null;
  }
  return user;
}
