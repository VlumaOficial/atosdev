-- ============================================================
-- ATOS — Migration 027 (F6): fotos de evidência imutáveis no storage
-- ============================================================
-- Achado testando o código de verificação (2026-09-23): a policy
-- evidencias_update (migration 021) deixava QUALQUER arquivo do tenant
-- ser sobrescrito (upsert) — inclusive foto de evidência já enviada. A
-- verificação detecta a troca ("Foto alterada"), mas o certo é impedir.
--
-- O UPDATE só existe por causa de dois casos legítimos que regravam no
-- mesmo caminho: a logo ({tenant}/logo.png, "Trocar logo") e a
-- assinatura ({tenant}/assinaturas/{os}.png, re-assinar). A policy passa
-- a valer SÓ para eles. Fotos de OS/checklist (e miniaturas) não podem
-- mais ser sobrescritas por ninguém do app.
-- ============================================================

drop policy if exists evidencias_update on storage.objects;
create policy evidencias_update on storage.objects
  for update
  using (
    bucket_id = 'evidencias'
    and (public.get_meu_role() = 'super_admin' or (storage.foldername(name))[1] = public.get_meu_tenant()::text)
    and (name ~ '^[^/]+/logo\.png$' or split_part(name, '/', 2) = 'assinaturas')
  )
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.get_meu_tenant()::text
    and (name ~ '^[^/]+/logo\.png$' or split_part(name, '/', 2) = 'assinaturas')
  );
