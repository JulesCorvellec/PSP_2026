# PSP automatisé — Cellance

Outil interactif d'exploration du Plan Stratégique de Patrimoine (PSP) : un frontend HTML autonome (React + Chart.js + SheetJS + Leaflet, chargés en CDN — `index.html`) et un backend léger (Vercel Serverless Functions, dossier `api/`) qui sert de proxy authentifié vers Supabase. Tout le traitement métier (import Excel, calculs, simulation) a lieu dans le navigateur ; seuls les échanges avec Supabase et l'authentification passent par le backend. Exceptions :
- l'onglet **Cartographie** transmet les adresses des résidences (uniquement les adresses, aucune autre donnée du fichier) à l'API publique et gratuite [api-adresse.data.gouv.fr](https://api-adresse.data.gouv.fr/) (Base Adresse Nationale) afin de les géolocaliser, directement depuis le navigateur (ce n'est pas Supabase) ; les résultats sont mis en cache dans le localStorage du navigateur puis dans une table Supabase partagée (via le backend) — une adresse déjà géocodée par n'importe qui n'est ensuite plus jamais renvoyée à l'API externe.
- les imports **sauvegardés** (bouton « Sauvegarder cet import ») sont stockés dans une base [Supabase](https://supabase.com/) partagée par tous les utilisateurs connectés de l'outil : n'importe quel compte peut voir, modifier ou supprimer une sauvegarde (pas de distinction par propriétaire — seule la connexion est requise, cf. « Authentification » ci-dessous).

## Authentification (backend)

Toute l'application est derrière un écran de connexion (email + mot de passe). Le frontend ne détient
plus aucune clé Supabase : il appelle `/api/*` (Vercel Serverless Functions, Node.js), qui seul
détient la clé `service_role` Supabase et signe les jetons de session.

- **Session** : un JWT valable 12h, posé par le backend dans un cookie `HttpOnly` + `Secure` +
  `SameSite=Strict` — illisible en JavaScript (protection XSS). Le frontend ne le lit jamais ; il
  détecte l'expiration/l'absence de session via les réponses `401` du backend et renvoie alors
  automatiquement vers l'écran de connexion (cf. `apiFetch`/`AuthGate` dans `index.html`).
- **Mots de passe** : hachés avec bcrypt (jamais stockés en clair), verrouillage temporaire (15 min)
  après 5 échecs de connexion consécutifs sur un compte.
- **Comptes** : pas d'inscription libre. Le tout premier compte (administrateur) se crée depuis
  l'écran affiché automatiquement tant qu'aucun compte n'existe (`/api/auth/bootstrap`, désactivé dès
  qu'un compte existe). Les comptes suivants se créent depuis l'onglet **Administration** (visible
  uniquement aux administrateurs) : ajout d'utilisateur, bascule administrateur/utilisateur,
  réinitialisation de mot de passe, suppression.

### Mise en place (une seule fois)

1. **Table utilisateurs** — dans l'éditeur SQL du projet Supabase déjà utilisé pour les sauvegardes/le
   cache de géocodage, exécuter `supabase_users_table.sql` (à la racine du dépôt).
2. **Variables d'environnement du backend** — dans Vercel (Project Settings → Environment Variables),
   définir (jamais dans un fichier commité — cf. `.env.local.example` pour tester en local avec
   `vercel dev`) :
   - `SUPABASE_URL` — même projet Supabase que celui déjà utilisé (Project Settings → API → Project URL).
   - `SUPABASE_SERVICE_ROLE_KEY` — clé **service_role** (Project Settings → API → service_role secret),
     à ne jamais confondre avec l'ancienne clé `anon` (retirée du frontend, à considérer comme
     compromise puisque visible dans l'historique Git — cf. étape 4).
   - `JWT_SECRET` — chaîne aléatoire longue, générée une fois : `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
3. **Déployer**, puis ouvrir l'outil : l'écran de création du premier compte administrateur s'affiche
   automatiquement (aucun compte n'existe encore). Les comptes suivants se créent depuis
   Administration une fois connecté.
4. **Verrouillage des tables existantes** (recommandé, après avoir vérifié que la connexion et les
   sauvegardes fonctionnent) — exécuter `supabase_lockdown_existing_tables.sql` pour retirer les
   anciennes policies RLS ouvertes à quiconque connaît la clé `anon` (le backend utilise
   `service_role`, qui contourne RLS et n'a besoin d'aucune policy). Envisager aussi de régénérer la
   clé `anon` du projet (Project Settings → API), puisque l'ancienne reste visible dans l'historique Git.

## Contenu du dépôt

- `index.html` — le frontend (v1.6). Ouvrable directement dans un navigateur, sans build.
- `api/` — le backend (Vercel Serverless Functions, Node.js) : authentification, administration des
  comptes, et proxy vers Supabase (sauvegardes partagées + cache de géocodage). Nécessite
  `npm install` (dépendances listées dans `package.json`) — Vercel s'en charge automatiquement au
  déploiement.
- `supabase_users_table.sql` / `supabase_lockdown_existing_tables.sql` — migrations SQL à exécuter
  manuellement dans l'éditeur SQL Supabase (cf. « Mise en place » ci-dessus).

## Fonctionnement

1. Ouvrir l'URL de déploiement (Vercel) de l'outil — `index.html` seul, ouvert en local sans le
   backend `api/` déployé à côté, n'affichera que l'écran de connexion sans jamais pouvoir s'y
   connecter (cf. « Authentification » ci-dessus).
2. Se connecter (ou créer le premier compte si aucun n'existe encore).
3. Importer un fichier PSP au format Excel (.xlsx) construit sur le gabarit Cellance.
4. Explorer les vues : Vue d'ensemble, Base de cotation, Investissements & simulation, Décarbonation & DPE, Actions identifiées, Analyse libre (tableau croisé dynamique), Cartographie.

Le moteur de parsing (`<script id="engine-source">`) détecte les colonnes par nom d'en-tête (regex), pas par position fixe, pour rester robuste aux variations d'un fichier bailleur à l'autre. Le contrôle de conformité à l'import ne bloque que sur l'absence du socle (onglet « Base de cotation » avec la colonne « Code de Résidence ») ; l'absence d'un module optionnel (Actions identifiées, grille de gains DPE) dégrade simplement les vues concernées.

## Référence

Le cahier des charges détaillé (V2) décrit l'arborescence de l'outil, le modèle de données, l'algorithme de cascade DPE (§8.2) et le périmètre V1/V2. Il n'est pas inclus dans ce dépôt public pour l'instant — se référer au document interne Cellance si besoin.

Le moteur applique aussi des replis de robustesse pour rester fiable face aux variations réelles des
fichiers bailleurs : une valeur "NR" / "N/A" dans un champ numérique est traitée comme une donnée
manquante (et non affichée comme "NaN") ; si la répartition DPE par classe (A à G) d'une résidence est
entièrement vide alors qu'une étiquette globale est renseignée, le parc de la résidence est rattaché à
cette étiquette plutôt que classé "non renseigné".

## Prochaines évolutions (V2, hors périmètre actuel)

- Cartographie : clustering des marqueurs pour les gros parcs.
- Sauvegarde / comparaison de scénarios de simulation.
- Édition des données sources depuis l'outil.
