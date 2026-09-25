-- ============================================================
-- ATOS — Migration 035: módulo "Calendários" (base de tempo)
-- ============================================================
-- Decisões do usuário (2026-09-25, VISAO_ATOS.md 9.8): uma base única de
-- "tempo de trabalho" que recorrência, SLA e mensagens consultam — nenhum
-- módulo tem regra própria de dia útil.
--   1. Fuso horário da empresa
--   2. Feriados em camadas: plataforma (nacionais), estadual (UF),
--      municipal (código IBGE da cidade), da empresa; tipo feriado /
--      ponto facultativo / expediente reduzido (janela das X às Y); a
--      empresa decide o efeito de cada um (folga / normal / reduzido)
--   3. Horários de atendimento NOMEADOS e reutilizáveis, um padrão
--   4. (Escalas — etapa futura, junto com a notificação diária)
--   5. Horário de funcionamento da Unidade do cliente (opcional)
--   6. Funções de tempo no banco (dia útil, próximo dia útil, horas
--      úteis entre A e B, somar horas úteis)
-- Formato da semana (jsonb): chaves "0".."6" (0 = domingo, igual a
-- extract(dow)), cada uma com lista de intervalos ["HH:MM","HH:MM"]
-- ordenados e sem sobreposição; "24:00" permitido como fim.
-- ============================================================

-- ---------- utilitários ----------
create or replace function public.fn_semana_valida(s jsonb)
returns boolean language plpgsql immutable as $$
declare k text; v jsonb; p jsonb; ini time; fim time; ult time;
begin
  if s is null then return true; end if;
  if jsonb_typeof(s) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(s) loop
    if k not in ('0','1','2','3','4','5','6') or jsonb_typeof(v) <> 'array' then return false; end if;
    ult := null;
    for p in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2 then return false; end if;
      if (p->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
      if (p->>1) !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then return false; end if;
      ini := (p->>0)::time; fim := (p->>1)::time;
      if fim <= ini then return false; end if;
      if ult is not null and ini < ult then return false; end if;
      ult := fim;
    end loop;
  end loop;
  return true;
end $$;

-- UF a partir dos 2 primeiros dígitos do código IBGE do município
create or replace function public.fn_uf_do_ibge(p_ibge text)
returns text language sql immutable as $$
  select case left(p_ibge, 2)
    when '11' then 'RO' when '12' then 'AC' when '13' then 'AM' when '14' then 'RR' when '15' then 'PA'
    when '16' then 'AP' when '17' then 'TO' when '21' then 'MA' when '22' then 'PI' when '23' then 'CE'
    when '24' then 'RN' when '25' then 'PB' when '26' then 'PE' when '27' then 'AL' when '28' then 'SE'
    when '29' then 'BA' when '31' then 'MG' when '32' then 'ES' when '33' then 'RJ' when '35' then 'SP'
    when '41' then 'PR' when '42' then 'SC' when '43' then 'RS' when '50' then 'MS' when '51' then 'MT'
    when '52' then 'GO' when '53' then 'DF' end
$$;

-- Domingo de Páscoa (algoritmo gregoriano anônimo / Meeus)
create or replace function public.fn_pascoa(p_ano int)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

-- ---------- 1. fuso e sede da empresa ----------
alter table public.tenants add column if not exists fuso_horario text not null default 'America/Sao_Paulo'
  check (fuso_horario in ('America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha'));
-- cidade da sede: define feriados estaduais/municipais quando não há Unidade
alter table public.tenants add column if not exists sede_cidade_ibge text check (sede_cidade_ibge ~ '^[0-9]{7}$');
alter table public.tenants add column if not exists sede_cidade text;

create or replace function public.definir_fuso_horario(p_fuso text)
returns void language plpgsql security definer as $$
begin
  if public.get_meu_role() <> 'admin' then raise exception 'Sem permissão'; end if;
  if p_fuso not in ('America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha') then
    raise exception 'Fuso horário inválido';
  end if;
  update public.tenants set fuso_horario = p_fuso where id = public.get_meu_tenant();
end $$;

create or replace function public.definir_sede_empresa(p_cidade_ibge text, p_cidade text)
returns void language plpgsql security definer as $$
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if p_cidade_ibge is not null and (p_cidade_ibge !~ '^[0-9]{7}$' or public.fn_uf_do_ibge(p_cidade_ibge) is null) then
    raise exception 'Cidade inválida';
  end if;
  update public.tenants set sede_cidade_ibge = p_cidade_ibge, sede_cidade = nullif(trim(coalesce(p_cidade, '')), '')
  where id = public.get_meu_tenant();
end $$;

-- ---------- 5. Unidade: cidade (IBGE) + horário de funcionamento ----------
alter table public.locations add column if not exists cidade_ibge text check (cidade_ibge ~ '^[0-9]{7}$');
alter table public.locations add column if not exists horario_funcionamento jsonb
  check (public.fn_semana_valida(horario_funcionamento));

-- ---------- 3. horários de atendimento ----------
create table if not exists public.horarios_atendimento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 60),
  semana jsonb not null default '{}'::jsonb check (public.fn_semana_valida(semana)),
  considera_feriados boolean not null default true,
  padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists horarios_atendimento_nome_uk on public.horarios_atendimento (tenant_id, lower(trim(nome)));
create unique index if not exists horarios_atendimento_padrao_uk on public.horarios_atendimento (tenant_id) where padrao;

alter table public.horarios_atendimento enable row level security;
drop policy if exists horarios_atendimento_select on public.horarios_atendimento;
create policy horarios_atendimento_select on public.horarios_atendimento for select
  using (public.get_meu_role() = 'super_admin' or tenant_id = public.get_meu_tenant());
drop policy if exists horarios_atendimento_insert on public.horarios_atendimento;
create policy horarios_atendimento_insert on public.horarios_atendimento for insert
  with check (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'));
drop policy if exists horarios_atendimento_update on public.horarios_atendimento;
create policy horarios_atendimento_update on public.horarios_atendimento for update
  using (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
  with check (tenant_id = public.get_meu_tenant());
drop policy if exists horarios_atendimento_delete on public.horarios_atendimento;
create policy horarios_atendimento_delete on public.horarios_atendimento for delete
  using (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'));

-- o padrão não pode ser desativado nem excluído (sempre existe um)
create or replace function public.fn_horario_atendimento_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.padrao then raise exception 'Este é o horário padrão da empresa. Defina outro como padrão antes de excluir.'; end if;
    return old;
  end if;
  if new.padrao and not new.ativo then raise exception 'O horário padrão não pode ser desativado.'; end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_horario_atendimento_guarda on public.horarios_atendimento;
create trigger trg_horario_atendimento_guarda before update or delete on public.horarios_atendimento
  for each row execute function public.fn_horario_atendimento_guarda();

create or replace function public.definir_horario_padrao(p_id uuid)
returns void language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant();
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  if not exists (select 1 from public.horarios_atendimento where id = p_id and tenant_id = v_tenant and ativo) then
    raise exception 'Horário não encontrado ou inativo';
  end if;
  update public.horarios_atendimento set padrao = false where tenant_id = v_tenant and padrao and id <> p_id;
  update public.horarios_atendimento set padrao = true where id = p_id;
end $$;

-- toda empresa nasce com "Comercial" (seg–sex 08:00–18:00) como padrão
create or replace function public.fn_tenant_horario_padrao()
returns trigger language plpgsql security definer as $$
begin
  insert into public.horarios_atendimento (tenant_id, nome, semana, padrao)
  values (new.id, 'Comercial',
    '{"1":[["08:00","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],"4":[["08:00","18:00"]],"5":[["08:00","18:00"]]}'::jsonb,
    true)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_tenant_horario_padrao on public.tenants;
create trigger trg_tenant_horario_padrao after insert on public.tenants
  for each row execute function public.fn_tenant_horario_padrao();

insert into public.horarios_atendimento (tenant_id, nome, semana, padrao)
select t.id, 'Comercial',
  '{"1":[["08:00","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],"4":[["08:00","18:00"]],"5":[["08:00","18:00"]]}'::jsonb,
  true
from public.tenants t
where not exists (select 1 from public.horarios_atendimento h where h.tenant_id = t.id);

-- ---------- 2. feriados ----------
create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  -- null = plataforma (mantido pelo Super Admin, vale para todas as empresas)
  tenant_id uuid default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  data date not null,
  anual boolean not null default false,          -- repete todo ano no mesmo dia/mês
  nome text not null check (length(trim(nome)) between 2 and 80),
  abrangencia text not null check (abrangencia in ('nacional', 'estadual', 'municipal', 'empresa')),
  uf text check (uf ~ '^[A-Z]{2}$'),
  cidade_ibge text check (cidade_ibge ~ '^[0-9]{7}$'),
  cidade text,
  tipo text not null default 'feriado' check (tipo in ('feriado', 'facultativo', 'reduzido')),
  janela_inicio time,                            -- expediente só dentro desta janela
  janela_fim time,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  check (abrangencia <> 'nacional' or tenant_id is null),
  check (abrangencia <> 'empresa' or tenant_id is not null),
  check (abrangencia <> 'estadual' or uf is not null),
  check (abrangencia <> 'municipal' or (cidade_ibge is not null and uf is not null)),
  check ((janela_inicio is null) = (janela_fim is null)),
  check (janela_inicio is null or janela_fim > janela_inicio),
  check (tipo <> 'reduzido' or janela_inicio is not null)
);
create index if not exists feriados_data_idx on public.feriados (data);
create index if not exists feriados_tenant_idx on public.feriados (tenant_id);
create unique index if not exists feriados_uk on public.feriados
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), data, lower(nome), abrangencia, coalesce(uf, ''), coalesce(cidade_ibge, ''));

alter table public.feriados enable row level security;
drop policy if exists feriados_select on public.feriados;
create policy feriados_select on public.feriados for select
  using (tenant_id is null or tenant_id = public.get_meu_tenant() or public.get_meu_role() = 'super_admin');
drop policy if exists feriados_insert on public.feriados;
create policy feriados_insert on public.feriados for insert
  with check (
    (tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor') and abrangencia <> 'nacional')
    or (tenant_id is null and public.get_meu_role() = 'super_admin'));
drop policy if exists feriados_update on public.feriados;
create policy feriados_update on public.feriados for update
  using ((tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
      or (tenant_id is null and public.get_meu_role() = 'super_admin'))
  with check ((tenant_id = public.get_meu_tenant() and abrangencia <> 'nacional')
      or (tenant_id is null and public.get_meu_role() = 'super_admin'));
drop policy if exists feriados_delete on public.feriados;
create policy feriados_delete on public.feriados for delete
  using ((tenant_id = public.get_meu_tenant() and public.get_meu_role() in ('admin', 'gestor'))
      or (tenant_id is null and public.get_meu_role() = 'super_admin'));

-- efeito escolhido pela empresa (sem linha = padrão do tipo:
-- feriado → folga, facultativo → normal, reduzido → reduzido)
create table if not exists public.feriados_efeito_empresa (
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  feriado_id uuid not null references public.feriados(id) on delete cascade,
  efeito text not null check (efeito in ('folga', 'normal', 'reduzido')),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, feriado_id)
);
alter table public.feriados_efeito_empresa enable row level security;
drop policy if exists feriados_efeito_select on public.feriados_efeito_empresa;
create policy feriados_efeito_select on public.feriados_efeito_empresa for select
  using (tenant_id = public.get_meu_tenant() or public.get_meu_role() = 'super_admin');

create or replace function public.definir_efeito_feriado(p_feriado uuid, p_efeito text)
returns void language plpgsql security definer as $$
declare v_tenant uuid := public.get_meu_tenant(); v_f public.feriados;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  select * into v_f from public.feriados where id = p_feriado and (tenant_id is null or tenant_id = v_tenant);
  if not found then raise exception 'Feriado não encontrado'; end if;
  if p_efeito is null then
    delete from public.feriados_efeito_empresa where tenant_id = v_tenant and feriado_id = p_feriado;
    return;
  end if;
  if p_efeito not in ('folga', 'normal', 'reduzido') then raise exception 'Efeito inválido'; end if;
  if p_efeito = 'reduzido' and v_f.janela_inicio is null then
    raise exception 'Este dia não tem horário reduzido definido';
  end if;
  insert into public.feriados_efeito_empresa (tenant_id, feriado_id, efeito) values (v_tenant, p_feriado, p_efeito)
  on conflict (tenant_id, feriado_id) do update set efeito = excluded.efeito, atualizado_em = now();
end $$;

-- Feriados nacionais de um ano (plataforma). Carnaval, Quarta de Cinzas e
-- Corpus Christi são PONTO FACULTATIVO (não são feriados nacionais por
-- lei) — a empresa decide. Consciência Negra nacional desde 2024.
create or replace function public.gerar_feriados_nacionais(p_ano int)
returns int language plpgsql security definer as $$
declare v_p date := public.fn_pascoa(p_ano); v_n int;
begin
  if auth.uid() is not null and public.get_meu_role() <> 'super_admin' then raise exception 'Sem permissão'; end if;
  insert into public.feriados (tenant_id, data, nome, abrangencia, tipo, janela_inicio, janela_fim, criado_por)
  select null, d, n, 'nacional', t, ji, jf, null from (values
    (make_date(p_ano, 1, 1),   'Confraternização Universal', 'feriado', null::time, null::time),
    (v_p - 48,                 'Carnaval (segunda-feira)', 'facultativo', null, null),
    (v_p - 47,                 'Carnaval (terça-feira)', 'facultativo', null, null),
    (v_p - 46,                 'Quarta-feira de Cinzas (expediente a partir das 14h)', 'facultativo', '14:00'::time, '24:00'::time),
    (v_p - 2,                  'Sexta-feira Santa', 'feriado', null, null),
    (make_date(p_ano, 4, 21),  'Tiradentes', 'feriado', null, null),
    (make_date(p_ano, 5, 1),   'Dia do Trabalho', 'feriado', null, null),
    (v_p + 60,                 'Corpus Christi', 'facultativo', null, null),
    (make_date(p_ano, 9, 7),   'Independência do Brasil', 'feriado', null, null),
    (make_date(p_ano, 10, 12), 'Nossa Senhora Aparecida', 'feriado', null, null),
    (make_date(p_ano, 11, 2),  'Finados', 'feriado', null, null),
    (make_date(p_ano, 11, 15), 'Proclamação da República', 'feriado', null, null),
    (make_date(p_ano, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra', 'feriado', null, null),
    (make_date(p_ano, 12, 25), 'Natal', 'feriado', null, null)
  ) as x(d, n, t, ji, jf)
  where not (n like 'Dia Nacional de Zumbi%' and p_ano < 2024)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $$ begin
  for y in 2025..2036 loop perform public.gerar_feriados_nacionais(y); end loop;
end $$;

-- ---------- 6. funções de tempo ----------
-- Feriados que valem para a empresa num dia, numa cidade (IBGE).
-- Sem cidade: usa a sede da empresa.
create or replace function public.feriados_do_dia(p_tenant uuid, p_data date, p_cidade_ibge text default null)
returns table (feriado_id uuid, nome text, abrangencia text, tipo text, efeito text, janela_inicio time, janela_fim time)
language sql stable as $$
  with loc as (
    select coalesce(p_cidade_ibge, (select sede_cidade_ibge from public.tenants where id = p_tenant)) as ibge
  )
  select f.id, f.nome, f.abrangencia, f.tipo,
    coalesce(e.efeito, case f.tipo when 'feriado' then 'folga' when 'facultativo' then 'normal' else 'reduzido' end),
    f.janela_inicio, f.janela_fim
  from public.feriados f
  cross join loc
  left join public.feriados_efeito_empresa e on e.feriado_id = f.id and e.tenant_id = p_tenant
  where (f.tenant_id is null or f.tenant_id = p_tenant)
    and (f.data = p_data
         or (f.anual and f.data <= p_data
             and extract(month from f.data) = extract(month from p_data)
             and extract(day from f.data) = extract(day from p_data)))
    and (f.abrangencia in ('nacional', 'empresa')
         or (f.abrangencia = 'estadual' and f.uf = public.fn_uf_do_ibge(loc.ibge))
         or (f.abrangencia = 'municipal' and f.cidade_ibge = loc.ibge))
  order by f.nome
$$;

-- Intervalos de expediente (hora local da empresa) de um horário num dia.
-- Aplica feriados (se o horário considera): folga zera o dia; reduzido
-- limita à interseção com a janela.
create or replace function public.periodos_do_dia(p_horario uuid, p_data date, p_cidade_ibge text default null)
returns table (inicio time, fim time)
language plpgsql stable as $$
declare v_h public.horarios_atendimento; v_ini time := '00:00'; v_fim time := '24:00'; r record; p jsonb;
begin
  select * into v_h from public.horarios_atendimento where id = p_horario;
  if not found then return; end if;
  if v_h.considera_feriados then
    for r in select * from public.feriados_do_dia(v_h.tenant_id, p_data, p_cidade_ibge) loop
      if r.efeito = 'folga' then return; end if;
      if r.efeito = 'reduzido' and r.janela_inicio is not null then
        v_ini := greatest(v_ini, r.janela_inicio); v_fim := least(v_fim, r.janela_fim);
      end if;
    end loop;
  end if;
  for p in select * from jsonb_array_elements(coalesce(v_h.semana -> extract(dow from p_data)::int::text, '[]'::jsonb)) loop
    inicio := greatest((p->>0)::time, v_ini);
    fim := least((p->>1)::time, v_fim);
    if fim > inicio then return next; end if;
  end loop;
end $$;

create or replace function public.horario_padrao(p_tenant uuid default null)
returns uuid language sql stable as $$
  select id from public.horarios_atendimento
  where tenant_id = coalesce(p_tenant, public.get_meu_tenant()) and padrao limit 1
$$;

create or replace function public.eh_dia_util(p_horario uuid, p_data date, p_cidade_ibge text default null)
returns boolean language sql stable as $$
  select exists (select 1 from public.periodos_do_dia(p_horario, p_data, p_cidade_ibge))
$$;

-- Próximo dia útil a partir de p_data (inclusive). Null se não houver em ~1 ano.
create or replace function public.proximo_dia_util(p_horario uuid, p_data date, p_cidade_ibge text default null)
returns date language plpgsql stable as $$
begin
  for i in 0..370 loop
    if public.eh_dia_util(p_horario, p_data + i, p_cidade_ibge) then return p_data + i; end if;
  end loop;
  return null;
end $$;

-- Horas úteis entre dois instantes (base do SLA)
create or replace function public.horas_uteis_entre(p_horario uuid, p_inicio timestamptz, p_fim timestamptz, p_cidade_ibge text default null)
returns interval language plpgsql stable as $$
declare v_tz text; v_total interval := '0'; d date; r record; a timestamptz; b timestamptz;
begin
  if p_fim <= p_inicio then return v_total; end if;
  select t.fuso_horario into v_tz from public.horarios_atendimento h join public.tenants t on t.id = h.tenant_id where h.id = p_horario;
  if v_tz is null then return null; end if;
  if (p_fim - p_inicio) > interval '3660 days' then raise exception 'Intervalo longo demais'; end if;
  d := (p_inicio at time zone v_tz)::date;
  while d <= (p_fim at time zone v_tz)::date loop
    for r in select * from public.periodos_do_dia(p_horario, d, p_cidade_ibge) loop
      a := greatest((d + r.inicio) at time zone v_tz, p_inicio);
      b := least((d + r.fim) at time zone v_tz, p_fim);
      if b > a then v_total := v_total + (b - a); end if;
    end loop;
    d := d + 1;
  end loop;
  return v_total;
end $$;

-- Instante em que se completam p_duracao horas úteis a partir de p_inicio (prazo de SLA)
create or replace function public.somar_horas_uteis(p_horario uuid, p_inicio timestamptz, p_duracao interval, p_cidade_ibge text default null)
returns timestamptz language plpgsql stable as $$
declare v_tz text; v_resta interval := p_duracao; d date; r record; a timestamptz; b timestamptz;
begin
  select t.fuso_horario into v_tz from public.horarios_atendimento h join public.tenants t on t.id = h.tenant_id where h.id = p_horario;
  if v_tz is null then return null; end if;
  if p_duracao <= interval '0' then return p_inicio; end if;
  d := (p_inicio at time zone v_tz)::date;
  for i in 0..400 loop
    for r in select * from public.periodos_do_dia(p_horario, d, p_cidade_ibge) loop
      a := greatest((d + r.inicio) at time zone v_tz, p_inicio);
      b := (d + r.fim) at time zone v_tz;
      if b > a then
        if (b - a) >= v_resta then return a + v_resta; end if;
        v_resta := v_resta - (b - a);
      end if;
    end loop;
    d := d + 1;
  end loop;
  return null;
end $$;

-- Resumo de um dia para a tela "Conferir uma data" (e para suporte)
create or replace function public.situacao_do_dia(p_horario uuid, p_data date, p_cidade_ibge text default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'dia_util', exists (select 1 from public.periodos_do_dia(p_horario, p_data, p_cidade_ibge)),
    'periodos', coalesce((select jsonb_agg(jsonb_build_array(to_char(inicio, 'HH24:MI'),
                  case when fim = '24:00'::time then '24:00' else to_char(fim, 'HH24:MI') end) order by inicio)
                from public.periodos_do_dia(p_horario, p_data, p_cidade_ibge)), '[]'::jsonb),
    'feriados', coalesce((select jsonb_agg(jsonb_build_object('nome', f.nome, 'abrangencia', f.abrangencia,
                  'tipo', f.tipo, 'efeito', f.efeito))
                from public.feriados_do_dia(h.tenant_id, p_data, p_cidade_ibge) f), '[]'::jsonb),
    'considera_feriados', h.considera_feriados
  )
  from public.horarios_atendimento h where h.id = p_horario
$$;

-- Unidade aberta num instante? null = horário da Unidade não informado
create or replace function public.unidade_aberta(p_location uuid, p_momento timestamptz)
returns boolean language sql stable as $$
  select case when l.horario_funcionamento is null then null else exists (
    select 1 from jsonb_array_elements(coalesce(l.horario_funcionamento
      -> extract(dow from p_momento at time zone t.fuso_horario)::int::text, '[]'::jsonb)) p
    where (p_momento at time zone t.fuso_horario)::time >= (p->>0)::time
      and (p_momento at time zone t.fuso_horario)::time < (p->>1)::time) end
  from public.locations l join public.tenants t on t.id = l.tenant_id
  where l.id = p_location
$$;
