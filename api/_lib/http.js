import zlib from 'zlib';

// Vérifie la méthode HTTP et répond 405 sinon — évite de répéter ce contrôle dans chaque handler.
export function requireMethod(req, res, ...methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  res.status(405).json({ error: 'Méthode non autorisée.' });
  return false;
}

// Enveloppe un handler pour logger toute erreur non interceptée dans les logs serveur Vercel (sinon
// perdue en silence — cf. les erreurs de configuration comme SUPABASE_URL/JWT_SECRET manquants) et ne
// jamais laisser une exception non gérée produire un 500 opaque sans même un corps de réponse JSON.
export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur.' });
    }
  };
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Lit le corps JSON de la requête. Cas normal : déjà parsé par Vercel (Content-Type: application/json)
// dans req.body. Cas d'un corps volumineux (ex. sauvegarde d'un import complet) : le frontend l'envoie
// compressé (gzip, Content-Type: application/octet-stream — cf. index.html#apiFetch) pour rester sous
// la limite de taille de requête de la plateforme (~4,5 Mo, non contournable autrement) ; Vercel ne
// parse pas ce type de contenu automatiquement, donc on lit et décompresse le flux nous-mêmes ici.
export async function readJsonBody(req) {
  const isGzip = (req.headers['content-encoding'] || '').toLowerCase().includes('gzip');
  if (!isGzip) return req.body || null;
  const raw = await readRawBody(req);
  if (!raw.length) return null;
  return JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
}
