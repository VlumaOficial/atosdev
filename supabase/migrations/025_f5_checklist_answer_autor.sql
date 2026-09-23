-- ============================================================
-- ATOS — Migration 025: autor e hora da resposta de checklist
-- ============================================================
-- Achado em 2026-09-23 (testando a exportação ZIP, planilha com "Autor"
-- vazio): checklist_answers.answered_by NUNCA era preenchido — o app não
-- enviava e a coluna não tinha default (0 de 3 respostas com autor no
-- DEV). E answered_at só era gravado no INSERT: ao corrigir uma resposta,
-- a hora continuava a da primeira gravação.
--
-- Correção no banco (mesmo princípio do histórico da migration 013:
-- nenhuma gravação escapa, venha de onde vier): gatilho BEFORE INSERT/
-- UPDATE marca quem gravou (auth.uid()) e quando. No UPDATE só remarca
-- se o valor mudou — salvar de novo a mesma resposta não "rouba" a
-- autoria. O histórico (fn_checklist_answer_history) continua guardando
-- o estado ANTERIOR, independente deste gatilho.
-- Respostas antigas sem autor ficam como estão (não há como deduzir).
-- ============================================================

create or replace function public.fn_checklist_answer_autor()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.answered_by := coalesce(auth.uid(), new.answered_by);
    new.answered_at := coalesce(new.answered_at, now());
  elsif new.value is distinct from old.value or new.file_path is distinct from old.file_path then
    new.answered_by := coalesce(auth.uid(), new.answered_by);
    new.answered_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_checklist_answer_autor on public.checklist_answers;
create trigger trg_checklist_answer_autor
  before insert or update on public.checklist_answers
  for each row execute function public.fn_checklist_answer_autor();
