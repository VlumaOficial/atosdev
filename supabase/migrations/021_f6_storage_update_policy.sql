-- ============================================================
-- ATOS — Migration 021 (F6): policy de UPDATE faltante no bucket evidencias
-- ============================================================
-- Achado pelo usuário testando "Trocar logo" em Configurações: o bucket
-- evidencias (migration 014) só tinha policies de SELECT/INSERT/DELETE.
-- Upload com upsert:true (logo, e também a assinatura em
-- uploadSignature.ts) faz um UPDATE quando o arquivo já existe no path
-- — sem policy de UPDATE, o RLS bloqueia com "new row violates row-level
-- security policy" a partir da SEGUNDA vez que se sobe no mesmo caminho.
-- ============================================================

create policy "evidencias_update"
  on storage.objects for update
  using (
    bucket_id = 'evidencias'
    and (
      public.get_meu_role() = 'super_admin'
      or (storage.foldername(name))[1] = public.get_meu_tenant()::text
    )
  )
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.get_meu_tenant()::text
  );
