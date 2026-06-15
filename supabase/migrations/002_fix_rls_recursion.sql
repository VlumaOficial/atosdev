-- ============================================================
-- ATOS — Migration 002: Correção de recursão infinita em RLS
-- ============================================================
-- Contexto: as policies originais da F1 (migration 001) consultavam
-- a própria tabela public.users dentro das policies de public.users,
-- gerando recursão infinita ("infinite recursion detected in policy
-- for relation users") e retornando HTTP 500 na API REST.
--
-- Solução: funções SECURITY DEFINER que leem role/tenant do usuário
-- sem disparar a avaliação de RLS, eliminando o loop. Mesmo padrão
-- já adotado no Operax (get_meu_perfil).
--
-- Aplicada e validada no ambiente DEV (atosdev: vgkiddqahubznlzkxfgb).
-- PENDENTE de aplicação no ambiente PRD (atos: zeejmwdyqrbjnkhwtdsu).
-- ============================================================

-- 1. Remover policies antigas (recursivas) da migration 001
drop policy if exists "super_admin_all_users" on public.users;
drop policy if exists "tenant_users_same_tenant" on public.users;
drop policy if exists "admin_manage_tenant_users" on public.users;
drop policy if exists "admin_update_tenant_users" on public.users;
drop policy if exists "super_admin_all_tenants" on public.tenants;
drop policy if exists "tenant_members_own_tenant" on public.tenants;

-- 2. Funções SECURITY DEFINER — leem o perfil sem disparar RLS
create or replace function public.get_meu_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql security definer stable;

create or replace function public.get_meu_tenant()
returns uuid as $$
  select tenant_id from public.users where id = auth.uid();
$$ language sql security definer stable;

-- 3. Policies de USERS (sem recursão)
create policy "users_super_admin_all"
  on public.users for all
  using (public.get_meu_role() = 'super_admin');

create policy "users_select_own_or_same_tenant"
  on public.users for select
  using (
    id = auth.uid()
    or tenant_id = public.get_meu_tenant()
  );

create policy "users_admin_insert"
  on public.users for insert
  with check (
    public.get_meu_role() in ('super_admin','admin')
  );

create policy "users_admin_update"
  on public.users for update
  using (
    public.get_meu_role() in ('super_admin','admin')
  );

-- 4. Policies de TENANTS (usam a função, sem recursão)
create policy "tenants_super_admin_all"
  on public.tenants for all
  using (public.get_meu_role() = 'super_admin');

create policy "tenants_member_select"
  on public.tenants for select
  using (id = public.get_meu_tenant());
