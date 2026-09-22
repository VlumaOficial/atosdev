-- ============================================================
-- ATOS — Migration 004 (F2): Unidade principal automática
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22 — aplicada originalmente via SQL Editor do Supabase,
-- sem arquivo versionado. Ver nota em supabase/migrations/README.md.
-- ============================================================

alter table public.locations
  add column if not exists is_primary boolean not null default false;

-- ============================================================
-- TRIGGER: ao criar um cliente, cria automaticamente sua unidade
-- principal (mesmos dados de endereço do cliente)
-- ============================================================
create or replace function public.criar_unidade_principal()
returns trigger as $$
begin
  insert into public.locations (tenant_id, client_id, name, address, is_primary)
  values (
    new.tenant_id,
    new.id,
    new.name,
    new.address,
    true
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_client_created
  after insert on public.clients
  for each row execute function public.criar_unidade_principal();
