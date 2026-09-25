-- ============================================================
-- ATOS — Migration 037: CPF ou CNPJ na Unidade
-- ============================================================
-- Pedido do usuário (2026-09-25): a Unidade também tem "CPF ou CNPJ",
-- validado como no Cliente (migration 036) — ex.: filial com CNPJ
-- próprio (mesma raiz da matriz) ou local de pessoa física. Opcional.
-- A tela avisa (sem bloquear) quando a raiz do CNPJ difere da do cliente.
-- ============================================================

-- regra única de CPF/CNPJ: devolve formatado, null se vazio, erro se inválido
create or replace function public.normalizar_documento(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 11 and not public.cpf_valido(d) then raise exception 'CPF inválido — confira os números.'; end if;
  if length(d) = 14 and not public.cnpj_valido(d) then raise exception 'CNPJ inválido — confira os números.'; end if;
  if length(d) not in (11, 14) then raise exception 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'; end if;
  return public.formatar_documento(d);
end $$;

-- cliente passa a usar a mesma regra (comportamento igual ao da 036)
create or replace function public.fn_cliente_documento()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.cnpj is not distinct from old.cnpj then return new; end if;
  new.cnpj := public.normalizar_documento(new.cnpj);
  return new;
end $$;

alter table public.locations add column if not exists documento text;

-- valida só quando o documento MUDA
create or replace function public.fn_location_documento()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.documento is not distinct from old.documento then return new; end if;
  new.documento := public.normalizar_documento(new.documento);
  return new;
end $$;
drop trigger if exists trg_location_documento on public.locations;
create trigger trg_location_documento before insert or update on public.locations
  for each row execute function public.fn_location_documento();
