-- ============================================================
-- ATOS — Migration 020 (F6): RPC segura p/ usuário salvar suas preferências
-- ============================================================
-- Achado testando o consentimento LGPD: RLS de public.users só libera
-- UPDATE pra admin/super_admin (users_admin_update). Um tecnico ou
-- gestor tentando salvar a propria coluna preferences (consentimento
-- de localizacao, preferencia de lista/cards) atualiza 0 linhas, sem
-- erro visivel — mesma classe de bug ja corrigida em tenants (migration
-- 018). Afeta tambem useViewPreference.ts, que ja existia antes deste
-- bloco e sofria do mesmo problema silenciosamente.
--
-- Funcao restrita a `id = auth.uid()` — cada usuario só mexe na propria
-- linha, em uma coluna só (preferences), independente do role.
-- ============================================================

create or replace function public.atualizar_minhas_preferencias(p_preferences jsonb)
returns void as $$
begin
  update public.users
  set preferences = p_preferences
  where id = auth.uid();
end;
$$ language plpgsql security definer;
