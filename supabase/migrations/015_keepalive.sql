-- ============================================================
-- ATOS — Migration 015: Keep-alive do Supabase (anti-suspensão)
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
--
-- Padrão VLUMA (VLUMA_KeepAlive_Supabase_Padrao_v2.1). O projeto
-- free do Supabase suspende por inatividade; um ping periódico
-- (GitHub Actions) evita a suspensão. Coluna "ambiente" identifica
-- de qual ambiente (DEV/PRD) veio o ping, para visibilidade no log.
-- Tabela singleton: só existe (e só pode existir) a linha id = 1.
-- ============================================================

create table if not exists public.keepalive_ping (
  id        smallint primary key default 1,
  last_ping timestamptz not null default now(),
  ambiente  text,
  constraint keepalive_singleton check (id = 1)
);

insert into public.keepalive_ping (id, ambiente)
values (1, 'DEV')
on conflict (id) do nothing;

-- ============================================================
-- RLS — leitura anônima liberada (o ping roda com a anon key, sem
-- usuário autenticado); escrita segue a policy padrão do Supabase
-- (service_role sempre passa por RLS, então nenhuma policy de
-- insert/update é necessária aqui para o ping funcionar)
-- ============================================================
alter table public.keepalive_ping enable row level security;

create policy "keepalive_select_anon"
  on public.keepalive_ping for select
  to anon
  using (true);
