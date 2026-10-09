-- ============================================================
-- ATOS — Migration 049: regras de ESCRITA sem checagem de empresa
-- ============================================================
-- Achado em 2026-10-09 (varredura das regras de acesso antes da E1 do
-- portal), na sequência da 048:
--   users_admin_update / users_admin_insert (migration 002) só checavam o
--   PAPEL (admin), sem empresa e sem limitar o que muda: um admin podia
--   mudar o próprio perfil para super_admin ou trocar a própria empresa
--   (entrar em outra empresa como admin).
--   order_comments_update / order_evidences_update: o autor podia mover o
--   próprio comentário/evidência para uma OS de outra empresa.
-- Correção:
--   users — admin escreve só na própria empresa; gestor só edita técnicos
--   da própria empresa (a tela Técnicos já é liberada ao gestor e a edição
--   falhava); gatilho impede trocar empresa, mudar o próprio perfil e
--   promover a super_admin (só o Super Admin ou o servidor podem).
--   order_comments / order_evidences — a OS de destino tem que ser visível
--   (pode_ver_os, migration 043).
-- ============================================================

drop policy if exists users_admin_insert on public.users;
drop policy if exists users_admin_update on public.users;

create policy users_admin_insert on public.users for insert
  with check (get_meu_role() = 'admin' and tenant_id = get_meu_tenant()
              and role in ('admin', 'gestor', 'tecnico'));

create policy users_admin_update on public.users for update
  using (tenant_id = get_meu_tenant()
         and (get_meu_role() = 'admin' or (get_meu_role() = 'gestor' and role = 'tecnico')))
  with check (tenant_id = get_meu_tenant() and role in ('admin', 'gestor', 'tecnico'));

create or replace function public.fn_users_protege()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_papel text := public.get_meu_role();
begin
  -- servidor (service role: sem auth.uid()) e Super Admin podem tudo
  if auth.uid() is null or v_papel = 'super_admin' then return new; end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Não é permitido trocar a empresa de um usuário.';
  end if;
  if new.role is distinct from old.role then
    if new.id = auth.uid() then raise exception 'Não é permitido alterar o próprio perfil.'; end if;
    if v_papel <> 'admin' or new.role = 'super_admin' then
      raise exception 'Sem permissão para alterar o perfil deste usuário.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_users_protege on public.users;
create trigger trg_users_protege before update on public.users
  for each row execute function public.fn_users_protege();

drop policy if exists order_comments_update on public.order_comments;
create policy order_comments_update on public.order_comments for update
  using (user_id = auth.uid() and public.pode_ver_os(order_id))
  with check (user_id = auth.uid() and public.pode_ver_os(order_id));

drop policy if exists order_evidences_update on public.order_evidences;
create policy order_evidences_update on public.order_evidences for update
  using (created_by = auth.uid() and public.pode_ver_os(order_id))
  with check (created_by = auth.uid() and public.pode_ver_os(order_id));
