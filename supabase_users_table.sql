-- À exécuter une fois dans l'éditeur SQL Supabase (même projet que psp_shared_imports /
-- psp_geocode_cache) pour activer l'authentification du backend (cf. README.md, section
-- "Authentification (backend)").
--
-- RLS activée SANS AUCUNE policy : la table n'est donc accessible par PERSONNE via la clé publique
-- ("anon") ou une clé utilisateur — seule la clé service_role (utilisée uniquement côté serveur, dans
-- api/_lib/supabaseAdmin.js, jamais exposée au frontend) peut la lire/écrire, car cette clé
-- contourne systématiquement RLS.
create table if not exists public.psp_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  is_admin boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.psp_users enable row level security;
-- Intentionnellement aucune policy créée ici.
