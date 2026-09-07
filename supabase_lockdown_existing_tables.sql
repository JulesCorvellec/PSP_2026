-- À exécuter APRÈS avoir déployé et vérifié le nouveau backend (variables d'environnement
-- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / JWT_SECRET en place, connexion fonctionnelle) : retire
-- les policies "public" ouvertes à quiconque connaît l'ancienne clé "anon" (désormais retirée du
-- frontend, mais toujours visible dans l'historique Git du dépôt, donc à considérer comme
-- potentiellement compromise). Le backend utilise la clé service_role, qui contourne RLS et n'a donc
-- besoin d'aucune policy pour continuer à fonctionner après ce verrouillage.
--
-- Ne pas exécuter avant d'avoir confirmé que la connexion/l'admin/les sauvegardes fonctionnent via le
-- nouveau backend, sous peine de perdre l'accès aux données depuis l'ancien frontend en cours de
-- transition.
drop policy if exists "public read" on public.psp_shared_imports;
drop policy if exists "public insert" on public.psp_shared_imports;
drop policy if exists "public update" on public.psp_shared_imports;
drop policy if exists "public delete" on public.psp_shared_imports;

drop policy if exists "public read" on public.psp_geocode_cache;
drop policy if exists "public insert" on public.psp_geocode_cache;
drop policy if exists "public update" on public.psp_geocode_cache;

-- Recommandé en complément (hors SQL, dans le dashboard Supabase) : Project Settings → API →
-- régénérer la clé "anon" pour invalider définitivement l'ancienne clé codée en dur dans l'historique
-- Git, même si elle ne donne plus accès à rien après ce verrouillage.
