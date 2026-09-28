-- ============================================================
-- ATOS — Migration 045: alertas de SLA (etapa C)
-- ============================================================
-- Desenho aprovado (2026-09-25): aviso no app para admin/gestor quando a
-- OS entra em "em risco" (% configurável, padrão 75%) e quando vence.
-- Sem justificativa obrigatória. Um verificador no banco (pg_cron, a cada
-- 5 min) cria um aviso por pessoa, uma vez por situação; se os prazos
-- mudarem (pausa que para o relógio, agendamento combinado, troca de
-- prioridade/categoria), a OS pode alertar de novo.
-- Depois (junto da notificação diária): WhatsApp/e-mail.
-- ============================================================

alter table public.orders add column if not exists sla_alerta_risco_em timestamptz;
alter table public.orders add column if not exists sla_alerta_vencido_em timestamptz;

-- prazos mudaram → a OS pode alertar de novo (roda depois de trg_orders_sla, por ordem de nome)
create or replace function public.fn_orders_sla_reset_alerta()
returns trigger language plpgsql as $$
begin
  if new.prazo_solucao is distinct from old.prazo_solucao or new.prazo_atendimento is distinct from old.prazo_atendimento
     or new.prazo_resposta is distinct from old.prazo_resposta then
    new.sla_alerta_risco_em := null;
    new.sla_alerta_vencido_em := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_sla_reset_alerta on public.orders;
create trigger trg_orders_sla_reset_alerta before update on public.orders
  for each row execute function public.fn_orders_sla_reset_alerta();

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  tipo text not null check (tipo in ('sla_em_risco', 'sla_vencido')),
  order_id uuid references public.orders(id) on delete cascade,
  titulo text not null,
  corpo text,
  criada_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists notificacoes_user_idx on public.notificacoes (user_id, criada_em desc);
alter table public.notificacoes enable row level security;
drop policy if exists notificacoes_select on public.notificacoes;
create policy notificacoes_select on public.notificacoes for select using (user_id = auth.uid());
-- sem insert/update/delete direto: só pelas funções abaixo

create or replace function public.marcar_notificacoes_lidas(p_ids uuid[] default null)
returns int language plpgsql security definer as $$
declare v_n int;
begin
  update public.notificacoes set lida_em = now()
  where user_id = auth.uid() and lida_em is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- verificador (só servidor/cron)
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
    from public.users u where u.tenant_id = o.tenant_id and u.role in ('admin', 'gestor') and coalesce(u.active, true);
    v_n := v_n + 1;

    update public.orders set
      sla_alerta_risco_em = coalesce(sla_alerta_risco_em, now()),
      sla_alerta_vencido_em = case when v_tipo = 'sla_vencido' then now() else sla_alerta_vencido_em end
    where id = o.id;
  end loop;
  return v_n;
end $$;
revoke execute on function public.verificar_alertas_sla() from public, anon, authenticated;

-- tempo real: o sino atualiza sozinho
do $$ begin
  alter publication supabase_realtime add table public.notificacoes;
exception when others then raise notice 'publicação: %', sqlerrm;
end $$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'atos-alertas-sla';
  perform cron.schedule('atos-alertas-sla', '*/5 * * * *', 'select public.verificar_alertas_sla()');
exception when others then
  raise notice 'pg_cron indisponível neste ambiente: %', sqlerrm;
end $$;
