-- ============================================================
-- ATOS — Migration 056: perfil "Atendente" (portal E2)
-- ============================================================
-- Decisão do usuário (2026-10-08, ponto 3c/6B): o N1 que faz a triagem não é
-- técnico de campo nem gestor. O Atendente vê todas as OS da empresa,
-- abre/edita, classifica, atribui, transfere e conversa; NÃO exclui OS e NÃO
-- mexe em cadastros nem configurações (clientes, unidades, catálogo, SLA,
-- calendários, painel gerencial, configurações continuam admin/gestor).
-- ============================================================

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('super_admin', 'admin', 'gestor', 'atendente', 'tecnico'));

-- OS: abrir e editar
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert
  with check (get_meu_role() = 'super_admin'
              or (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor', 'atendente')));

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update
  using (get_meu_role() = 'super_admin'
         or (tenant_id = get_meu_tenant() and get_meu_role() in ('admin', 'gestor', 'atendente'))
         or (tenant_id = get_meu_tenant() and technician_id = auth.uid()));

-- usuários: o admin cria/edita atendentes (gestor continua só técnicos)
drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users for insert
  with check (get_meu_role() = 'admin' and tenant_id = get_meu_tenant()
              and role in ('admin', 'gestor', 'atendente', 'tecnico'));

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update
  using (tenant_id = get_meu_tenant()
         and (get_meu_role() = 'admin' or (get_meu_role() = 'gestor' and role = 'tecnico')))
  with check (tenant_id = get_meu_tenant() and role in ('admin', 'gestor', 'atendente', 'tecnico'));
