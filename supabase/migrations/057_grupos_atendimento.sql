-- ============================================================
-- ATOS — Migration 057: grupos de atendimento, ficha do catálogo, transferência (portal E2)
-- ============================================================
-- Desenho aprovado pelo usuário em 2026-10-08 (VISAO_ATOS.md 9.1, pontos 3, 4 e 6B):
--   * grupos de atendimento (N1/N2/N3/Campo): membros, coordenador, categorias
--     atendidas; "Assumir" opcional por grupo (padrão desligado)
--   * ficha do catálogo: descrição para o cliente, "aparece no portal?" (sem
--     pré-marcação), tipos em que aparece, grupo padrão
--   * OS com grupo; roteamento automático pelo grupo padrão da categoria
--   * Transferir (grupo e/ou técnico), com motivo, direção automática,
--     histórico, contador e alerta de "pingue-pongue"
--   * alertas de SLA também para o coordenador do grupo
--
-- SEGURANÇA: o técnico continua vendo só as PRÓPRIAS OS. A única exceção é a
-- fila de um grupo em que ele é membro e que liga o "Assumir" (OS do grupo
-- ainda sem técnico). Transferir e assumir só existem como funções (o
-- técnico não consegue passar a OS por UPDATE direto).
-- ============================================================

-- ---------- configuração ----------
alter table public.tenants add column if not exists transferencias_limite int not null default 3
  check (transferencias_limite between 2 and 20);   -- alerta de "pingue-pongue" a partir deste nº de transferências

-- ---------- grupos ----------
create table if not exists public.grupos_atendimento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_meu_tenant() references public.tenants(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  descricao text check (descricao is null or length(descricao) <= 300),
  nivel text not null check (nivel in ('n1', 'n2', 'n3', 'campo')),
  assumir boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists grupos_atendimento_nome_uk on public.grupos_atendimento (tenant_id, lower(trim(nome)));
alter table public.grupos_atendimento enable row level security;
drop policy if exists grupos_atendimento_select on public.grupos_atendimento;
create policy grupos_atendimento_select on public.grupos_atendimento for select
  using (tenant_id = get_meu_tenant());

create table if not exists public.grupo_membros (
  grupo_id uuid not null references public.grupos_atendimento(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  coordenador boolean not null default false,
  primary key (grupo_id, user_id)
);
create index if not exists grupo_membros_user_idx on public.grupo_membros (user_id);
alter table public.grupo_membros enable row level security;
drop policy if exists grupo_membros_select on public.grupo_membros;
create policy grupo_membros_select on public.grupo_membros for select
  using (tenant_id = get_meu_tenant() and (get_meu_role() in ('admin', 'gestor', 'atendente') or user_id = auth.uid()));

-- o técnico pode assumir a fila deste grupo?
create or replace function public.pode_assumir_fila(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.grupo_membros m join public.grupos_atendimento g on g.id = m.grupo_id
    where m.grupo_id = p_grupo and m.user_id = auth.uid() and g.assumir and g.ativo and g.tenant_id = public.get_meu_tenant())
$$;
revoke execute on function public.pode_assumir_fila(uuid) from public, anon;
grant execute on function public.pode_assumir_fila(uuid) to authenticated;

-- ---------- ficha do catálogo ----------
alter table public.os_categorias add column if not exists descricao_portal text;
alter table public.os_categorias add column if not exists visivel_portal boolean;   -- nulo = o admin ainda não decidiu (não aparece)
alter table public.os_categorias add column if not exists tipos_portal text[] not null default '{}';
alter table public.os_categorias add column if not exists grupo_padrao_id uuid references public.grupos_atendimento(id) on delete set null;
do $$ begin
  alter table public.os_categorias add constraint os_categorias_descricao_portal_ck check (descricao_portal is null or length(descricao_portal) <= 300);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.os_categorias add constraint os_categorias_tipos_portal_ck
    check (tipos_portal <@ array['incidente', 'requisicao', 'visita', 'preventiva']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.os_categorias add constraint os_categorias_visivel_tipos_ck
    check (not coalesce(visivel_portal, false) or cardinality(tipos_portal) > 0);
exception when duplicate_object then null; end $$;

-- assistente: decide a visibilidade de várias categorias de uma vez
-- p_itens: [{"id": uuid, "visivel": bool, "tipos": ["incidente", ...]}]
create or replace function public.definir_visibilidade_categorias(p_itens jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare x jsonb; v_n int := 0; v_tipos text[];
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    v_tipos := coalesce((select array_agg(t) from jsonb_array_elements_text(coalesce(x->'tipos', '[]')) t), '{}');
    if (x->>'visivel')::boolean and cardinality(v_tipos) = 0 then
      raise exception 'Escolha em quais tipos a categoria aparece no portal.';
    end if;
    update public.os_categorias
       set visivel_portal = (x->>'visivel')::boolean,
           tipos_portal = case when (x->>'visivel')::boolean then v_tipos else '{}' end
     where id = (x->>'id')::uuid and tenant_id = public.get_meu_tenant();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.definir_visibilidade_categorias(jsonb) from public, anon;
grant execute on function public.definir_visibilidade_categorias(jsonb) to authenticated;

-- ---------- grupos: cadastro ----------
-- p_membros: [{"user_id": uuid, "coordenador": bool}]; p_categorias: categorias atendidas (grupo padrão)
create or replace function public.salvar_grupo(p_id uuid, p_nome text, p_descricao text, p_nivel text,
  p_assumir boolean, p_ativo boolean, p_membros jsonb, p_categorias uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t uuid := public.get_meu_tenant(); v_id uuid := p_id; m jsonb; v_role text;
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  begin
    if p_id is null then
      insert into public.grupos_atendimento (tenant_id, nome, descricao, nivel, assumir, ativo)
      values (v_t, trim(p_nome), nullif(trim(coalesce(p_descricao, '')), ''), p_nivel, coalesce(p_assumir, false), coalesce(p_ativo, true))
      returning id into v_id;
    else
      update public.grupos_atendimento set nome = trim(p_nome), descricao = nullif(trim(coalesce(p_descricao, '')), ''),
        nivel = p_nivel, assumir = coalesce(p_assumir, false), ativo = coalesce(p_ativo, true)
      where id = p_id and tenant_id = v_t;
      if not found then raise exception 'Grupo não encontrado.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe um grupo com este nome.';
  end;

  delete from public.grupo_membros where grupo_id = v_id;
  for m in select * from jsonb_array_elements(coalesce(p_membros, '[]')) loop
    select role into v_role from public.users
     where id = (m->>'user_id')::uuid and tenant_id = v_t and coalesce(active, true);
    if v_role is null then raise exception 'Membro inválido: o usuário não pertence a esta empresa ou está inativo.'; end if;
    if v_role not in ('admin', 'gestor', 'atendente', 'tecnico') then raise exception 'Perfil não pode ser membro de grupo.'; end if;
    if coalesce((m->>'coordenador')::boolean, false) and v_role = 'tecnico' then
      raise exception 'O coordenador do grupo deve ser Gestor, Atendente ou Administrador.';
    end if;
    insert into public.grupo_membros (grupo_id, user_id, tenant_id, coordenador)
    values (v_id, (m->>'user_id')::uuid, v_t, coalesce((m->>'coordenador')::boolean, false))
    on conflict (grupo_id, user_id) do update set coordenador = excluded.coordenador;
  end loop;

  -- categorias atendidas = grupo padrão dessas categorias
  update public.os_categorias set grupo_padrao_id = null
   where tenant_id = v_t and grupo_padrao_id = v_id and id <> all (coalesce(p_categorias, '{}'));
  update public.os_categorias set grupo_padrao_id = v_id
   where tenant_id = v_t and id = any (coalesce(p_categorias, '{}'));
  return v_id;
end $$;
revoke execute on function public.salvar_grupo(uuid, text, text, text, boolean, boolean, jsonb, uuid[]) from public, anon;
grant execute on function public.salvar_grupo(uuid, text, text, text, boolean, boolean, jsonb, uuid[]) to authenticated;

create or replace function public.definir_limite_transferencias(p_limite int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_meu_role() not in ('admin', 'gestor') then raise exception 'Sem permissão'; end if;
  update public.tenants set transferencias_limite = p_limite where id = public.get_meu_tenant();
end $$;
revoke execute on function public.definir_limite_transferencias(int) from public, anon;
grant execute on function public.definir_limite_transferencias(int) to authenticated;

-- ---------- OS: grupo, contador e roteamento ----------
alter table public.orders add column if not exists grupo_id uuid references public.grupos_atendimento(id) on delete set null;
alter table public.orders add column if not exists transferencias int not null default 0;
create index if not exists orders_grupo_idx on public.orders (tenant_id, grupo_id) where grupo_id is not null;

-- o grupo precisa ser da mesma empresa; na criação, o grupo padrão da categoria
-- (ou da categoria-mãe) vira o grupo da OS quando nenhum foi informado
create or replace function public.fn_orders_roteamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_g uuid;
begin
  if new.grupo_id is not null then
    if not exists (select 1 from public.grupos_atendimento g where g.id = new.grupo_id and g.tenant_id = new.tenant_id) then
      raise exception 'O grupo não pertence a esta empresa.';
    end if;
  elsif tg_op = 'INSERT' and new.categoria_id is not null then
    select coalesce(c.grupo_padrao_id, p.grupo_padrao_id) into v_g
      from public.os_categorias c left join public.os_categorias p on p.id = c.pai_id where c.id = new.categoria_id;
    if v_g is not null and exists (select 1 from public.grupos_atendimento g where g.id = v_g and g.tenant_id = new.tenant_id and g.ativo) then
      new.grupo_id := v_g;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_roteamento on public.orders;
create trigger trg_orders_roteamento before insert or update of grupo_id on public.orders
  for each row execute function public.fn_orders_roteamento();

-- o técnico vê a fila (OS sem técnico) dos grupos em que ele pode assumir
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (get_meu_role() = 'super_admin'
         or (tenant_id = get_meu_tenant() and (
              get_meu_role() <> 'tecnico'
              or technician_id = auth.uid()
              or (technician_id is null and grupo_id is not null and public.pode_assumir_fila(grupo_id)))));

create or replace function public.pode_ver_os(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_meu_role() = 'super_admin' or exists (
    select 1 from public.orders o
    where o.id = p_order and o.tenant_id = public.get_meu_tenant()
      and (public.get_meu_role() <> 'tecnico' or o.technician_id = auth.uid()
           or (o.technician_id is null and o.grupo_id is not null and public.pode_assumir_fila(o.grupo_id))))
$$;

-- ---------- notificações ----------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('sla_em_risco', 'sla_vencido', 'transferida', 'pingue_pongue'));

-- ---------- transferências ----------
create table if not exists public.os_transferencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  de_grupo_id uuid references public.grupos_atendimento(id) on delete set null,
  para_grupo_id uuid references public.grupos_atendimento(id) on delete set null,
  de_tecnico_id uuid references public.users(id) on delete set null,
  para_tecnico_id uuid references public.users(id) on delete set null,
  direcao text not null check (direcao in ('escalonamento', 'devolucao', 'lateral', 'encaminhamento', 'reatribuicao')),
  motivo text not null check (length(trim(motivo)) >= 5),
  status_anterior text,
  por uuid references public.users(id) on delete set null,
  em timestamptz not null default now()
);
create index if not exists os_transferencias_order_idx on public.os_transferencias (order_id, em);
alter table public.os_transferencias enable row level security;
drop policy if exists os_transferencias_select on public.os_transferencias;
create policy os_transferencias_select on public.os_transferencias for select
  using (public.pode_ver_os(order_id));

-- avisa os coordenadores (não técnicos) de um grupo
create or replace function public.fn_avisar_coordenadores(p_grupo uuid, p_tipo text, p_order uuid, p_titulo text, p_corpo text, p_exceto uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
  select o.tenant_id, u.id, p_tipo, o.id, p_titulo, p_corpo
  from public.orders o, public.grupo_membros m join public.users u on u.id = m.user_id
  where o.id = p_order and m.grupo_id = p_grupo and m.coordenador and coalesce(u.active, true)
    and u.role <> 'tecnico' and u.id is distinct from p_exceto;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.fn_avisar_coordenadores(uuid, text, uuid, text, text, uuid) from public, anon, authenticated;

-- Transferir a OS para outro grupo e/ou outro técnico.
--  * só grupo      → a OS cai na fila do grupo (sem técnico)
--  * só técnico    → o grupo vem do técnico (se participa de um só); com vários, é preciso escolher
--  * grupo+técnico → o técnico precisa ser do grupo
-- Quem pode: técnico responsável, coordenador do grupo atual, atendente, gestor e admin.
-- O SLA NÃO reinicia (o prazo é do cliente). OS em andamento/pausada volta para "aberta".
create or replace function public.transferir_os(p_order uuid, p_grupo uuid, p_tecnico uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders; v_papel text := public.get_meu_role(); v_t uuid := public.get_meu_tenant();
  v_novo_grupo uuid; v_novo_tec uuid; v_n int; v_tec_role text; v_tec_ativo boolean;
  v_rank_de int; v_rank_para int; v_dir text; v_status text; v_ator text;
  v_g_de text; v_g_para text; v_t_de text; v_t_para text; v_limite int; v_corpo text; v_avisados int := 0;
begin
  select * into o from public.orders where id = p_order and tenant_id = v_t;
  if o.id is null then raise exception 'OS não encontrada.'; end if;
  if o.status in ('concluida', 'cancelada') then raise exception 'Não é possível transferir uma OS % .', o.status; end if;
  if not (v_papel in ('admin', 'gestor', 'atendente')
          or o.technician_id = auth.uid()
          or exists (select 1 from public.grupo_membros m where m.grupo_id = o.grupo_id and m.user_id = auth.uid() and m.coordenador)) then
    raise exception 'Sem permissão para transferir esta OS.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo da transferência (mín. 5 caracteres).'; end if;
  if p_grupo is null and p_tecnico is null then raise exception 'Escolha o grupo e/ou o técnico de destino.'; end if;

  v_novo_grupo := o.grupo_id; v_novo_tec := o.technician_id;
  if p_grupo is not null then
    if not exists (select 1 from public.grupos_atendimento g where g.id = p_grupo and g.tenant_id = v_t and g.ativo) then
      raise exception 'Grupo de destino inválido ou inativo.';
    end if;
    v_novo_grupo := p_grupo;
    v_novo_tec := null;                       -- só grupo: cai na fila
  end if;
  if p_tecnico is not null then
    select role, coalesce(active, true) into v_tec_role, v_tec_ativo from public.users where id = p_tecnico and tenant_id = v_t;
    if v_tec_role is distinct from 'tecnico' or not coalesce(v_tec_ativo, false) then raise exception 'Técnico de destino inválido ou inativo.'; end if;
    v_novo_tec := p_tecnico;
    if p_grupo is null then
      select count(*) into v_n from public.grupo_membros m join public.grupos_atendimento g on g.id = m.grupo_id
       where m.user_id = p_tecnico and g.ativo;
      if v_n = 1 then
        select m.grupo_id into v_novo_grupo from public.grupo_membros m join public.grupos_atendimento g on g.id = m.grupo_id
         where m.user_id = p_tecnico and g.ativo;
      elsif v_n > 1 then
        raise exception 'Este técnico participa de mais de um grupo. Escolha também o grupo de destino.';
      end if;                                  -- sem grupo: mantém o grupo atual
    elsif not exists (select 1 from public.grupo_membros m where m.grupo_id = p_grupo and m.user_id = p_tecnico) then
      raise exception 'O técnico escolhido não faz parte do grupo de destino.';
    end if;
  end if;
  if v_novo_grupo is not distinct from o.grupo_id and v_novo_tec is not distinct from o.technician_id then
    raise exception 'A OS já está com este grupo e este técnico.';
  end if;

  -- direção pelo nível dos grupos
  select case nivel when 'n1' then 1 when 'n2' then 2 when 'n3' then 3 else 4 end into v_rank_de from public.grupos_atendimento where id = o.grupo_id;
  select case nivel when 'n1' then 1 when 'n2' then 2 when 'n3' then 3 else 4 end into v_rank_para from public.grupos_atendimento where id = v_novo_grupo;
  v_dir := case
    when v_novo_grupo is not distinct from o.grupo_id then 'reatribuicao'
    when o.grupo_id is null then 'encaminhamento'
    when v_novo_grupo is null then 'lateral'
    when v_rank_para > v_rank_de then 'escalonamento'
    when v_rank_para < v_rank_de then 'devolucao'
    else 'lateral' end;

  v_status := case when o.status in ('em_andamento', 'pausada') then 'aberta' else o.status end;
  update public.orders set grupo_id = v_novo_grupo, technician_id = v_novo_tec, status = v_status,
         pause_motivo_id = case when v_status <> 'pausada' then null else pause_motivo_id end,
         transferencias = transferencias + 1
   where id = o.id returning transferencias into v_n;

  insert into public.os_transferencias (tenant_id, order_id, de_grupo_id, para_grupo_id, de_tecnico_id, para_tecnico_id, direcao, motivo, status_anterior, por)
  values (v_t, o.id, o.grupo_id, v_novo_grupo, o.technician_id, v_novo_tec, v_dir, trim(p_motivo), o.status, auth.uid());

  select name into v_ator from public.users where id = auth.uid();
  select nome into v_g_de from public.grupos_atendimento where id = o.grupo_id;
  select nome into v_g_para from public.grupos_atendimento where id = v_novo_grupo;
  select name into v_t_de from public.users where id = o.technician_id;
  select name into v_t_para from public.users where id = v_novo_tec;
  insert into public.order_events (tenant_id, order_id, event_type, actor_id, actor_name, details)
  values (v_t, o.id, 'transferred', auth.uid(), v_ator, jsonb_strip_nulls(jsonb_build_object(
    'from_technician_id', o.technician_id, 'from_technician_name', v_t_de, 'to_technician_id', v_novo_tec, 'to_technician_name', v_t_para,
    'from_group_name', v_g_de, 'to_group_name', v_g_para, 'direcao', v_dir, 'motivo', trim(p_motivo))));

  -- avisos: coordenadores do grupo de destino; pingue-pongue ao passar do limite
  v_corpo := o.title || ' · ' || coalesce(v_g_de, 'sem grupo') || ' → ' || coalesce(v_g_para, 'sem grupo')
             || coalesce(' · ' || v_t_para, '') || ' · por ' || coalesce(v_ator, '—') || ': ' || trim(p_motivo);
  if v_novo_grupo is not null then
    v_avisados := public.fn_avisar_coordenadores(v_novo_grupo, 'transferida', o.id, o.number || ' — transferida para ' || coalesce(v_g_para, 'o grupo'), v_corpo, auth.uid());
  end if;
  select transferencias_limite into v_limite from public.tenants where id = v_t;
  if v_n >= v_limite then
    if v_novo_grupo is not null then
      perform public.fn_avisar_coordenadores(v_novo_grupo, 'pingue_pongue', o.id, o.number || ' — ' || v_n || ' transferências', 'A OS já foi transferida ' || v_n || ' vezes. Confira a distribuição e o catálogo. ' || v_corpo, auth.uid());
    end if;
    insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
    select v_t, u.id, 'pingue_pongue', o.id, o.number || ' — ' || v_n || ' transferências',
           'A OS já foi transferida ' || v_n || ' vezes. Confira a distribuição e o catálogo. ' || v_corpo
    from public.users u where u.tenant_id = v_t and u.role in ('admin', 'gestor') and coalesce(u.active, true) and u.id is distinct from auth.uid()
      and not exists (select 1 from public.notificacoes n where n.user_id = u.id and n.order_id = o.id and n.tipo = 'pingue_pongue' and n.titulo like '%— ' || v_n || ' transferências');
  end if;
  return jsonb_build_object('direcao', v_dir, 'status', v_status, 'transferencias', v_n, 'pingue_pongue', v_n >= v_limite);
end $$;
revoke execute on function public.transferir_os(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.transferir_os(uuid, uuid, uuid, text) to authenticated;

-- O técnico pega uma OS da fila do grupo (só se o grupo permitir)
create or replace function public.assumir_os(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_ator text;
begin
  if public.get_meu_role() <> 'tecnico' then raise exception 'Só técnicos assumem OS da fila.'; end if;
  select * into o from public.orders where id = p_order and tenant_id = public.get_meu_tenant() for update;
  if o.id is null or o.technician_id is not null or o.grupo_id is null or o.status not in ('aberta', 'agendada')
     or not public.pode_assumir_fila(o.grupo_id) then
    raise exception 'Esta OS não está mais disponível na fila do seu grupo.';
  end if;
  update public.orders set technician_id = auth.uid() where id = o.id;
  select name into v_ator from public.users where id = auth.uid();
  insert into public.order_events (tenant_id, order_id, event_type, actor_id, actor_name, details)
  values (o.tenant_id, o.id, 'assumed', auth.uid(), v_ator,
          jsonb_build_object('group_name', (select nome from public.grupos_atendimento where id = o.grupo_id)));
end $$;
revoke execute on function public.assumir_os(uuid) from public, anon;
grant execute on function public.assumir_os(uuid) to authenticated;

-- ---------- alertas de SLA: também o coordenador do grupo (não técnico) ----------
create or replace function public.verificar_alertas_sla()
returns int language plpgsql security definer set search_path = public as $$
declare o record; v_sit text; v_tipo text; v_fuso text; v_prazo timestamptz; v_titulo text; v_corpo text; v_n int := 0;
begin
  for o in
    select ord.*, public.sla_situacao(ord) as sit, c.name as cliente
    from public.orders ord left join public.clients c on c.id = ord.client_id
    where ord.prazo_solucao is not null and ord.status not in ('concluida', 'cancelada') and ord.sla_pausado_desde is null
      and (ord.sla_alerta_vencido_em is null)
  loop
    v_sit := o.sit;
    if v_sit = 'vencido' then v_tipo := 'sla_vencido';
    elsif v_sit = 'em_risco' and o.sla_alerta_risco_em is null then v_tipo := 'sla_em_risco';
    else continue; end if;

    select fuso_horario into v_fuso from public.tenants where id = o.tenant_id;
    v_prazo := case when o.atendido_em is null then least(o.prazo_atendimento, o.prazo_solucao) else o.prazo_solucao end;
    v_titulo := o.number || case when v_tipo = 'sla_vencido' then ' — SLA vencido' else ' — SLA em risco' end;
    v_corpo := o.title || coalesce(' · ' || o.cliente, '') || ' · ' ||
      case when o.atendido_em is null then 'atendimento' else 'solução' end ||
      case when v_tipo = 'sla_vencido' then ' venceu ' else ' vence ' end ||
      to_char(v_prazo at time zone coalesce(v_fuso, 'America/Sao_Paulo'), 'DD/MM "às" HH24:MI');

    insert into public.notificacoes (tenant_id, user_id, tipo, order_id, titulo, corpo)
    select o.tenant_id, u.id, v_tipo, o.id, v_titulo, v_corpo
    from public.users u
    where u.tenant_id = o.tenant_id and coalesce(u.active, true) and (
      u.role in ('admin', 'gestor')
      or (u.role <> 'tecnico' and o.grupo_id is not null and exists (
            select 1 from public.grupo_membros m where m.grupo_id = o.grupo_id and m.user_id = u.id and m.coordenador)));
    v_n := v_n + 1;

    update public.orders set
      sla_alerta_risco_em = coalesce(sla_alerta_risco_em, now()),
      sla_alerta_vencido_em = case when v_tipo = 'sla_vencido' then now() else sla_alerta_vencido_em end
    where id = o.id;
  end loop;
  return v_n;
end $$;
revoke execute on function public.verificar_alertas_sla() from public, anon, authenticated;
