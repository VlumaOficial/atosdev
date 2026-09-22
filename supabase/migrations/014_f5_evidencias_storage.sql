-- ============================================================
-- ATOS — Migration 014 (F5 bloco D): Storage de evidências
-- ============================================================
-- Reconstruída a partir do schema real do DEV (vgkiddqahubznlzkxfgb)
-- em 2026-09-22. Ver nota em supabase/migrations/README.md.
--
-- Bucket privado para fotos de evidência anexadas no checklist.
-- Compressão (1600px / qualidade 80%) acontece no navegador antes
-- do upload (ver src/components/orders/FotoEvidencia.tsx). Isolamento
-- por tenant: o primeiro segmento do path do arquivo é o tenant_id.
-- Decisão (jul/2026, ver VISAO_ATOS.md F6): só a imagem já carimbada
-- será guardada quando o carimbo (logo/GPS/data) for implementado —
-- o original sem carimbo não é armazenado.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('evidencias', 'evidencias', false, 5242880)
on conflict (id) do nothing;

-- ============================================================
-- RLS — storage.objects, restrito ao bucket "evidencias"
-- Path esperado: {tenant_id}/{...}. O primeiro segmento da pasta
-- precisa bater com o tenant do usuário logado.
-- ============================================================
create policy "evidencias_select"
  on storage.objects for select
  using (
    bucket_id = 'evidencias'
    and (
      public.get_meu_role() = 'super_admin'
      or (storage.foldername(name))[1] = public.get_meu_tenant()::text
    )
  );

create policy "evidencias_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.get_meu_tenant()::text
  );

create policy "evidencias_delete"
  on storage.objects for delete
  using (
    bucket_id = 'evidencias'
    and (
      public.get_meu_role() = 'super_admin'
      or (storage.foldername(name))[1] = public.get_meu_tenant()::text
    )
  );
