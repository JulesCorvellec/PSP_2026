# PSP automatisé — Cellance

Outil interactif d'exploration du Plan Stratégique de Patrimoine (PSP), livré comme un fichier HTML autonome (React + Chart.js + SheetJS, chargés en CDN). Aucune donnée n'est transmise à un serveur : tout le traitement (import Excel, calculs, simulation) a lieu dans le navigateur.

## Contenu du dépôt

- `index.html` — l'application complète (v1.4). Ouvrable directement dans un navigateur, sans build ni serveur.

## Fonctionnement

1. Ouvrir `index.html` dans un navigateur.
2. Importer un fichier PSP au format Excel (.xlsx) construit sur le gabarit Cellance.
3. Explorer les vues : Vue d'ensemble, Base de cotation, Investissements & simulation, Décarbonation & DPE, Actions identifiées.

Le moteur de parsing (`<script id="engine-source">`) détecte les colonnes par nom d'en-tête (regex), pas par position fixe, pour rester robuste aux variations d'un fichier bailleur à l'autre. Le contrôle de conformité à l'import ne bloque que sur l'absence du socle (onglet « Base de cotation » avec la colonne « Code de Résidence ») ; l'absence d'un module optionnel (Actions identifiées, grille de gains DPE) dégrade simplement les vues concernées.

## Référence

Le cahier des charges détaillé (V2) décrit l'arborescence de l'outil, le modèle de données, l'algorithme de cascade DPE (§8.2) et le périmètre V1/V2. Il n'est pas inclus dans ce dépôt public pour l'instant — se référer au document interne Cellance si besoin.

## Prochaines évolutions (V2, hors périmètre actuel)

- Cartographie (clustering, Leaflet).
- Sauvegarde / comparaison de scénarios de simulation.
- Édition des données sources depuis l'outil.
- Module d'analyse libre façon pivot.
