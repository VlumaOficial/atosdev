-- ============================================================
-- ATOS — Migration 042: técnico lê só as próprias OS
-- ============================================================
-- Achado em 2026-09-25 (teste da lista de OS, migration 041): a policy
-- de leitura de orders (F3) liberava a empresa inteira para qualquer
-- papel — o técnico lia pela API todas as OS da empresa, não só as
-- dele (a tela filtrava, o banco não). Escrita já era restrita
-- (orders_update: técnico só a própria). Ajuste autorizado pelo usuário.
-- ============================================================

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (
    public.get_meu_role() = 'super_admin'
    or (tenant_id = public.get_meu_tenant()
        and (public.get_meu_role() <> 'tecnico' or technician_id = auth.uid()))
  );
