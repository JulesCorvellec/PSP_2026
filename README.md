# PSP automatisé — Cellance

Outil interactif d'exploration du Plan Stratégique de Patrimoine (PSP), livré comme un fichier HTML autonome (React + Chart.js + SheetJS + Leaflet, chargés en CDN). Tout le traitement (import Excel, calculs, simulation) a lieu dans le navigateur. Exceptions :
- l'onglet **Cartographie** transmet les adresses des résidences (uniquement les adresses, aucune autre donnée du fichier) à l'API publique et gratuite [api-adresse.data.gouv.fr](https://api-adresse.data.gouv.fr/) (Base Adresse Nationale) afin de les géolocaliser ; les résultats sont mis en cache dans le localStorage du navigateur pour éviter de re-géocoder à chaque session.
- les imports **sauvegardés** (bouton « Sauvegarder cet import ») sont stockés dans une base [Supabase](https://supabase.com/) partagée par tous les visiteurs de l'outil : n'importe qui ayant accès à l'URL de l'outil peut voir, modifier ou supprimer une sauvegarde (pas de compte, pas d'authentification — cf. « Sauvegarde partagée » ci-dessous).

## Sauvegarde partagée (Supabase)

L'écran d'import (bouton « Sauvegarder cet import ») écrit dans une table Supabase commune à tous les utilisateurs — ce n'est plus un stockage local au navigateur. À configurer une seule fois :

1. Créer un projet gratuit sur [supabase.com](https://supabase.com/).
2. Dans l'éditeur SQL du projet, exécuter :
   ```sql
   create table if not exists public.psp_shared_imports (
     id text primary key,
     payload jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.psp_shared_imports enable row level security;
   create policy "public read" on public.psp_shared_imports for select using (true);
   create policy "public insert" on public.psp_shared_imports for insert with check (true);
   create policy "public update" on public.psp_shared_imports for update using (true) with check (true);
   create policy "public delete" on public.psp_shared_imports for delete using (true);
   ```
   Ces politiques ouvrent la table en lecture/écriture à quiconque connaît la clé publique (« anon ») du projet — cohérent avec le choix de ne pas gérer de comptes, mais à garder en tête si des sauvegardes contiennent des données sensibles.
3. Dans `index.html`, renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` (section « Sauvegarde partagée des imports (Supabase) ») avec l'URL du projet et sa clé publique `anon`, visibles dans Project Settings → API.

Tant que ces deux valeurs ne sont pas renseignées, l'écran d'import fonctionne mais aucune sauvegarde n'est possible.

## Contenu du dépôt

- `index.html` — l'application complète (v1.5). Ouvrable directement dans un navigateur, sans build ni serveur.

## Fonctionnement

1. Ouvrir `index.html` dans un navigateur.
2. Importer un fichier PSP au format Excel (.xlsx) construit sur le gabarit Cellance.
3. Explorer les vues : Vue d'ensemble, Base de cotation, Investissements & simulation, Décarbonation & DPE, Actions identifiées, Analyse libre (tableau croisé dynamique), Cartographie.

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
