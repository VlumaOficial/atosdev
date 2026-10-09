-- ============================================================
-- ATOS — Migration 062: portal — avisos por e-mail dos chamados (E4)
-- ============================================================
-- Quando um chamado do portal é aberto ou muda de situação, a função portal-avisos
-- envia o e-mail ao solicitante — SÓ se ele aceitou a comunicação (LGPD), escolheu o
-- canal e a empresa o liberou. O gatilho chama a função pelo mesmo caminho do
-- relatório da OS (pg_net + chave no Vault). ATENÇÃO (PRD): a URL abaixo é a do DEV,
-- como na migration 030 — trocar pelo ref do projeto de produção.
-- ============================================================

create or replace function public.fn_orders_avisar_portal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chave text; v_evento text;
begin
  if new.solicitante_id is null then return new; end if;
  if tg_op = 'INSERT' then
    v_evento := 'aberto';
  elsif new.status is distinct from old.status then
    v_evento := case new.status when 'agendada' then 'agendada' when 'em_andamento' then 'em_atendimento'
                                when 'concluida' then 'resolvido' when 'cancelada' then 'cancelado' else null end;
  elsif new.status = 'agendada' and new.scheduled_at is distinct from old.scheduled_at then
    v_evento := 'agendada';
  end if;
  if v_evento is null then return new; end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'atos_service_role_key' limit 1;
  if v_chave is not null then
    perform net.http_post(
      url := 'https://vgkiddqahubznlzkxfgb.supabase.co/functions/v1/portal-avisos',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
      body := jsonb_build_object('order_id', new.id, 'evento', v_evento),
      timeout_milliseconds := 30000);
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_avisar_portal() from public, anon, authenticated;

drop trigger if exists trg_orders_avisar_portal on public.orders;
create trigger trg_orders_avisar_portal after insert or update of status, scheduled_at on public.orders
  for each row execute function public.fn_orders_avisar_portal();
