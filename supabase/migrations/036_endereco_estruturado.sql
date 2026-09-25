-- ============================================================
-- ATOS — Migration 036: endereço estruturado de Clientes/Unidades
-- ============================================================
-- Decisões do usuário (2026-09-25, VISAO_ATOS.md 9.8):
--   * Glossário: Super Admin → Empresas (tenants); empresa → Clientes
--     (quem ela atende) e Unidades (endereços físicos do cliente)
--   * Endereço mora SÓ na Unidade (fonte única). O modal do Cliente edita
--     a Unidade principal — na criação E na edição (antes o texto só era
--     copiado na criação e divergia depois)
--   * Endereço estruturado: CEP, logradouro, número, complemento, bairro
--     + cidade pelo código IBGE (migration 035). UF + cidade obrigatórias
--   * Cliente pessoa física: campo "CPF ou CNPJ" (coluna cnpj guarda
--     os dois, formatados), com validação dos dígitos
-- `locations.address` continua existindo como texto de exibição
-- ("Rua X, 27 - Sala 102 - Bairro"), montado pelo banco a partir dos
-- campos — PDF, "Abrir no mapa" e OS seguem funcionando sem mudança.
-- ============================================================

alter table public.locations add column if not exists cep text check (cep ~ '^[0-9]{8}$');
alter table public.locations add column if not exists logradouro text;
alter table public.locations add column if not exists numero text;
alter table public.locations add column if not exists complemento text;
alter table public.locations add column if not exists bairro text;

create or replace function public.fn_endereco_composto(p_logradouro text, p_numero text, p_complemento text, p_bairro text)
returns text language sql immutable as $$
  select nullif(concat_ws(' - ',
    nullif(concat_ws(', ', nullif(trim(p_logradouro), ''), nullif(trim(p_numero), '')), ''),
    nullif(trim(p_complemento), ''),
    nullif(trim(p_bairro), '')), '')
$$;

-- endereço de exibição e UF sempre coerentes com os campos estruturados
create or replace function public.fn_location_endereco()
returns trigger language plpgsql as $$
begin
  if coalesce(new.logradouro, new.numero, new.complemento, new.bairro, new.cep) is not null then
    new.address := public.fn_endereco_composto(new.logradouro, new.numero, new.complemento, new.bairro);
  end if;
  if new.cidade_ibge is not null then
    new.state := public.fn_uf_do_ibge(new.cidade_ibge);
  end if;
  return new;
end $$;
drop trigger if exists trg_location_endereco on public.locations;
create trigger trg_location_endereco before insert or update on public.locations
  for each row execute function public.fn_location_endereco();

-- ---------- CPF ou CNPJ ----------
create or replace function public.cpf_valido(p text)
returns boolean language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; dv1 int; dv2 int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; dv1 := case when r = 10 then 0 else r end;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; dv2 := case when r = 10 then 0 else r end;
  return dv1 = substr(d, 10, 1)::int and dv2 = substr(d, 11, 1)::int;
end $$;

create or replace function public.formatar_documento(p text)
returns text language sql immutable as $$
  select case length(d)
    when 11 then substr(d,1,3)||'.'||substr(d,4,3)||'.'||substr(d,7,3)||'-'||substr(d,10,2)
    when 14 then substr(d,1,2)||'.'||substr(d,3,3)||'.'||substr(d,6,3)||'/'||substr(d,9,4)||'-'||substr(d,13,2)
    else nullif(d, '') end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x
$$;

-- valida só quando o documento MUDA (cadastros antigos inválidos não
-- travam outras edições, mas não podem ser regravados errados)
create or replace function public.fn_cliente_documento()
returns trigger language plpgsql as $$
declare d text := regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g');
begin
  if tg_op = 'UPDATE' and new.cnpj is not distinct from old.cnpj then return new; end if;
  if d = '' then new.cnpj := null; return new; end if;
  if length(d) = 11 and not public.cpf_valido(d) then raise exception 'CPF inválido — confira os números.'; end if;
  if length(d) = 14 and not public.cnpj_valido(d) then raise exception 'CNPJ inválido — confira os números.'; end if;
  if length(d) not in (11, 14) then raise exception 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'; end if;
  new.cnpj := public.formatar_documento(d);
  return new;
end $$;
drop trigger if exists trg_cliente_documento on public.clients;
create trigger trg_cliente_documento before insert or update on public.clients
  for each row execute function public.fn_cliente_documento();

update public.clients set cnpj = null where trim(coalesce(cnpj, '')) = '' and cnpj is not null;

-- ---------- salvar cliente + unidade principal numa transação ----------
-- SECURITY INVOKER: as policies de clients/locations continuam valendo.
-- p_principal: unidade existente escolhida como principal (null = a
-- principal atual, ou cria uma nova com o nome do cliente)
create or replace function public.salvar_cliente(
  p_id uuid, p_nome text, p_documento text, p_email text, p_telefone text, p_ativo boolean,
  p_principal uuid, p_endereco jsonb
) returns uuid language plpgsql as $$
declare v_id uuid := p_id; v_loc uuid; v_ibge text := nullif(p_endereco->>'cidade_ibge', '');
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if nullif(trim(coalesce(p_nome, '')), '') is null then raise exception 'O nome do cliente é obrigatório.'; end if;
  if v_ibge is null or v_ibge !~ '^[0-9]{7}$' or public.fn_uf_do_ibge(v_ibge) is null then
    raise exception 'Informe a UF e a cidade do endereço principal.';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;

  if v_id is null then
    insert into public.clients (name, cnpj, email, phone, active)
    values (trim(p_nome), p_documento, nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''), coalesce(p_ativo, true))
    returning id into v_id;   -- gatilho da migration 004 cria a unidade principal
  else
    update public.clients set name = trim(p_nome), cnpj = p_documento,
      email = nullif(trim(coalesce(p_email, '')), ''), phone = nullif(trim(coalesce(p_telefone, '')), ''),
      active = coalesce(p_ativo, active)
    where id = v_id;
    if not found then raise exception 'Cliente não encontrado.'; end if;
  end if;

  if p_principal is not null then
    if not exists (select 1 from public.locations where id = p_principal and client_id = v_id) then
      raise exception 'A unidade escolhida não pertence a este cliente.';
    end if;
    v_loc := p_principal;
  else
    select id into v_loc from public.locations where client_id = v_id and is_primary order by created_at limit 1;
  end if;
  if v_loc is null then
    insert into public.locations (tenant_id, client_id, name, is_primary)
    select tenant_id, id, name, true from public.clients where id = v_id
    returning id into v_loc;
  end if;
  update public.locations set is_primary = (id = v_loc) where client_id = v_id and (is_primary or id = v_loc);

  update public.locations set
    cep = nullif(regexp_replace(coalesce(p_endereco->>'cep', ''), '\D', '', 'g'), ''),
    logradouro = nullif(trim(coalesce(p_endereco->>'logradouro', '')), ''),
    numero = nullif(trim(coalesce(p_endereco->>'numero', '')), ''),
    complemento = nullif(trim(coalesce(p_endereco->>'complemento', '')), ''),
    bairro = nullif(trim(coalesce(p_endereco->>'bairro', '')), ''),
    cidade_ibge = v_ibge,
    city = nullif(trim(coalesce(p_endereco->>'cidade', '')), '')
  where id = v_loc;

  -- texto legado do cliente acompanha a unidade principal
  update public.clients set address = (select address from public.locations where id = v_loc) where id = v_id;
  return v_id;
end $$;

-- ---------- sede da empresa pelo Super Admin (consulta à Receita) ----------
create or replace function public.definir_sede_tenant(p_tenant uuid, p_cidade_ibge text, p_cidade text)
returns void language plpgsql security definer as $$
begin
  if public.get_meu_role() <> 'super_admin' then raise exception 'Sem permissão'; end if;
  if p_cidade_ibge is null or p_cidade_ibge !~ '^[0-9]{7}$' or public.fn_uf_do_ibge(p_cidade_ibge) is null then
    raise exception 'Cidade inválida';
  end if;
  update public.tenants set sede_cidade_ibge = p_cidade_ibge, sede_cidade = nullif(trim(coalesce(p_cidade, '')), '')
  where id = p_tenant;
end $$;
