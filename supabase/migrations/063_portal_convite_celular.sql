-- 063 — o celular informado no "Solicitar acesso" acompanha o convite
-- (antes se perdia: a tela de criar senha abria em branco e a pessoa ficava sem celular)
alter table public.portal_convites add column if not exists celular text;
