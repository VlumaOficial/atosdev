-- ============================================================
-- ATOS — F1: Estrutura Multi-tenant
-- Executar no Supabase DEV: vgkiddqahubznlzkxfgb
-- ============================================================

-- Extensão UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- TENANTS
-- ============================================================
create table if not exists public.tenants (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  cnpj        text,
  email       text,
  phone       text,
  status      text not null default 'trial' check (status in ('active','suspended','trial')),
  plan        text not null default 'starter' check (plan in ('starter','professional','enterprise')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- USERS (perfis de acesso ao painel web)
-- ============================================================
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete cascade,  -- null = Super Admin VLUMA
  name        text not null,
  email       text not null,
  role        text not null default 'tecnico' check (role in ('super_admin','admin','gestor','tecnico')),
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- RLS — Tenants
-- ============================================================
alter table public.tenants enable row level security;

-- Super Admin vê tudo
create policy "super_admin_all_tenants"
  on public.tenants for all
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- Admin/Gestor/Técnico vê só o próprio tenant
create policy "tenant_members_own_tenant"
  on public.tenants for select
  using (
    id in (
      select tenant_id from public.users where id = auth.uid()
    )
  );

-- ============================================================
-- RLS — Users
-- ============================================================
alter table public.users enable row level security;

-- Super Admin vê todos
create policy "super_admin_all_users"
  on public.users for all
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'super_admin'
    )
  );

-- Usuário do tenant vê apenas o próprio tenant
create policy "tenant_users_same_tenant"
  on public.users for select
  using (
    tenant_id in (
      select tenant_id from public.users where id = auth.uid()
    )
    or id = auth.uid()
  );

-- Admin pode inserir/atualizar usuários do mesmo tenant
create policy "admin_manage_tenant_users"
  on public.users for insert
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('super_admin', 'admin')
        and (u.tenant_id = tenant_id or u.role = 'super_admin')
    )
  );

create policy "admin_update_tenant_users"
  on public.users for update
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('super_admin', 'admin')
        and (u.tenant_id = tenant_id or u.role = 'super_admin')
    )
  );

-- ============================================================
-- TRIGGER: updated_at automático em tenants
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.handle_updated_at();

-- ============================================================
-- TRIGGER: criar perfil em public.users ao registrar no auth
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'tecnico')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TENANT INICIAL: Infoxtec (primeiro cliente validador)
-- ============================================================
insert into public.tenants (id, name, cnpj, email, status, plan)
values (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Infoxtec Tecnologia e Serviços Ltda.',
  '00.000.000/0001-00',  -- substituir pelo CNPJ real
  'adm@infoxtec.com.br',
  'active',
  'professional'
)
on conflict (id) do nothing;

-- ============================================================
-- Comentários finais
-- ============================================================
-- Após rodar esta migration:
-- 1. Crie o usuário Super Admin no Supabase Auth (Authentication > Users)
--    com email adm@vluma.com.br
-- 2. Atualize manualmente o role para 'super_admin':
--    UPDATE public.users SET role = 'super_admin', tenant_id = null
--    WHERE email = 'adm@vluma.com.br';
-- 3. Crie o usuário Admin da Infoxtec e vincule ao tenant acima.
