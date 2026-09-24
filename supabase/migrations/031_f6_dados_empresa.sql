-- ============================================================
-- ATOS — Migration 031 (F6): dados da empresa editáveis pelo admin
-- ============================================================
-- Pedido do usuário (2026-09-24, revisando o PDF): os dados do cabeçalho
-- do relatório vinham do cadastro do tenant feito pelo Super Admin (o
-- e-mail era o do login do admin). Agora o ADMIN edita, em
-- Configurações → "Marca e dados da empresa": nome de exibição (nome
-- fantasia — resolve também o nome longo cortado no menu), CNPJ,
-- telefone, e-mail de contato e site. A razão social (tenants.name)
-- continua sendo do Super Admin (dado contratual).
-- ============================================================

alter table public.tenants
  add column if not exists trade_name text,
  add column if not exists website text;

-- CNPJ: 14 dígitos + dígitos verificadores
create or replace function public.cnpj_valido(p text)
returns boolean as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; dv1 int; dv2 int;
begin
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * pesos1[i]; end loop;
  r := s % 11; dv1 := case when r < 2 then 0 else 11 - r end;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * pesos2[i]; end loop;
  r := s % 11; dv2 := case when r < 2 then 0 else 11 - r end;
  return dv1 = substr(d, 13, 1)::int and dv2 = substr(d, 14, 1)::int;
end;
$$ language plpgsql immutable;

create or replace function public.atualizar_dados_empresa(
  p_nome_exibicao text, p_cnpj text, p_telefone text, p_email text, p_site text
) returns void as $$
declare
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
begin
  if public.get_meu_role() not in ('admin', 'super_admin') then
    raise exception 'Sem permissão para alterar os dados da empresa';
  end if;
  if v_cnpj is not null and not public.cnpj_valido(v_cnpj) then
    raise exception 'CNPJ inválido';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail de contato inválido';
  end if;
  update public.tenants set
    trade_name = nullif(trim(coalesce(p_nome_exibicao, '')), ''),
    cnpj = case when v_cnpj is null then null
                else substr(v_cnpj,1,2)||'.'||substr(v_cnpj,3,3)||'.'||substr(v_cnpj,6,3)||'/'||substr(v_cnpj,9,4)||'-'||substr(v_cnpj,13,2) end,
    phone = nullif(trim(coalesce(p_telefone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    website = nullif(trim(coalesce(p_site, '')), ''),
    updated_at = now()
  where id = public.get_meu_tenant();
end;
$$ language plpgsql security definer;
