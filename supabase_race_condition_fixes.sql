-- À exécuter dans l'éditeur SQL Supabase (même projet que psp_users / psp_shared_imports), après
-- supabase_users_table.sql. Corrige trois conditions de concurrence identifiées en revue de code dans
-- le backend (api/auth/login.js, api/auth/bootstrap.js, api/saves/set-base.js) : les anciennes
-- versions faisaient un SELECT puis un UPDATE/INSERT séparés côté Node, ce qui laisse une fenêtre où
-- deux requêtes concurrentes lisent le même état avant qu'aucune n'ait écrit. Les fonctions
-- ci-dessous déplacent la lecture-modification-écriture dans une seule instruction SQL (atomique au
-- niveau de la ligne/table), exécutée via .rpc() côté backend.
--
-- Volontairement PAS en "security definer" : appelées uniquement via la clé service_role (qui
-- contourne déjà RLS), donc security invoker suffit. Le REVOKE/GRANT en bas de fichier est important :
-- sans lui, Postgres accorde EXECUTE à PUBLIC par défaut, ce qui permettrait d'appeler ces fonctions
-- directement via PostgREST avec l'ancienne clé "anon" (toujours visible dans l'historique Git),
-- contournant entièrement l'authentification/le rate-limiting du backend.

-- 1) Incrémente atomiquement le compteur d'échecs de connexion et pose le verrouillage si nécessaire.
--    Remplace le SELECT (lecture) + UPDATE (écriture séparée) de api/auth/login.js, qui laissait deux
--    tentatives concurrentes incrémenter à partir de la même valeur lue (undercount, verrouillage
--    jamais atteint si les requêtes sont parallélisées).
create or replace function public.psp_register_login_failure(
  p_user_id uuid,
  p_max_attempts int,
  p_lock_minutes int
)
returns table(failed_attempts int, locked_until timestamptz) as $$
  update public.psp_users
  set failed_attempts = case
        when public.psp_users.failed_attempts + 1 >= p_max_attempts then 0
        else public.psp_users.failed_attempts + 1
      end,
      locked_until = case
        when public.psp_users.failed_attempts + 1 >= p_max_attempts
          then now() + (p_lock_minutes || ' minutes')::interval
        else public.psp_users.locked_until
      end,
      updated_at = now()
  where public.psp_users.id = p_user_id
  returning public.psp_users.failed_attempts, public.psp_users.locked_until;
$$ language sql volatile;

-- 2) Crée le tout premier compte admin de façon atomique : verrou transactionnel (pg_advisory_xact_lock)
--    autour du "existe-t-il déjà un utilisateur ?" + insert, pour empêcher deux requêtes bootstrap
--    concurrentes (deux personnes ouvrant l'appli au même instant) de créer chacune un compte admin.
--    Le verrou est automatiquement relâché à la fin de la transaction (xact = transaction-scoped).
create or replace function public.psp_bootstrap_admin(
  p_email text,
  p_password_hash text
)
returns table(id uuid, email text, is_admin boolean) as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(842910837123);
  if exists (select 1 from public.psp_users) then
    return;
  end if;
  insert into public.psp_users (email, password_hash, is_admin)
  values (p_email, p_password_hash, true)
  returning public.psp_users.id into v_id;
  return query select public.psp_users.id, public.psp_users.email, public.psp_users.is_admin
    from public.psp_users where public.psp_users.id = v_id;
end;
$$ language plpgsql volatile;

-- 3) Bascule l'import "base" en une seule instruction UPDATE portant sur toutes les lignes concernées,
--    au lieu d'un SELECT de toute la table suivi d'une boucle d'upserts séquentiels côté Node (qui
--    pouvait laisser deux imports base=true ou aucun sous deux appels concurrents, et transférait
--    inutilement le payload complet de chaque sauvegarde pour ne modifier qu'un booléen).
-- p_id est en `text` (et non uuid) : les identifiants de sauvegarde sont générés côté client sous la
-- forme "psp_<timestamp>_<suffixe aléatoire>" (cf. index.html#genSaveId), pas des UUID.
create or replace function public.psp_set_base_save(p_id text)
returns void as $$
  update public.psp_shared_imports
  set payload = jsonb_set(payload, '{estBase}', to_jsonb(public.psp_shared_imports.id = p_id), true),
      updated_at = now()
  where coalesce((payload->>'estBase')::boolean, false) is distinct from (public.psp_shared_imports.id = p_id);
$$ language sql volatile;

revoke all on function public.psp_register_login_failure(uuid, int, int) from public;
revoke all on function public.psp_bootstrap_admin(text, text) from public;
revoke all on function public.psp_set_base_save(text) from public;

grant execute on function public.psp_register_login_failure(uuid, int, int) to service_role;
grant execute on function public.psp_bootstrap_admin(text, text) to service_role;
grant execute on function public.psp_set_base_save(text) to service_role;
