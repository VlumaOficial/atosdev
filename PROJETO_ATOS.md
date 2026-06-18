# ATOS — Gestão de Campo

> SaaS multi-tenant de Ordens de Serviço de campo. Desenvolvido por VLUMA.
> Primeiro cliente validador: Infoxtec (sem cobrança).
> Documento de projeto — fonte da verdade. Atualizar a cada marco.

---

## 1. Infraestrutura

| Item | Valor |
|------|-------|
| GitHub DEV | VlumaOficial/atosdev |
| GitHub PRD | VlumaOficial/atosprd |
| Supabase DEV | vgkiddqahubznlzkxfgb |
| Supabase PRD | zeejmwdyqrbjnkhwtdsu |
| Deploy | atosdev.vercel.app (auto-deploy no push da main) |
| Pasta projeto (WSL) | /mnt/c/Users/sdore/dyad-apps/atosdev |
| E-mail transacional | atos@vluma.com.br (Zoho, SMTP 587) |

**Stack:** React + Vite + TypeScript + Tailwind v3 + Shadcn-style + Supabase + Vercel
**Fluxo de dev:** Windsurf/WSL → commit/push GitHub → Vercel auto-deploy → testar na URL pública (sem teste local)

---

## 2. Usuários e Tenant (DEV)

- **Super Admin VLUMA:** adm@vluma.com.br | role super_admin | tenant_id null (NÃO cria OS — sem tenant)
- **Admin Infoxtec:** adm@infoxtec.com.br | role admin | tenant Infoxtec
- **Tenant Infoxtec:** "Infoxtec Tecnologia e Serviços Ltda." | CNPJ 04.309.223/0001-96
- **Massa de teste:** "Cliente Trigger Teste" (cliente), "Usuário Testes" / teste2 (técnicos)

---

## 3. Roteiro Oficial de Fases (MVP = F1 a F7)

| Fase | Entrega | No MVP? | Status real |
|------|---------|---------|-------------|
| F1 | Multi-tenant, auth, perfis | MVP | Feito |
| F2 | Clientes e Locais (Unidades) | MVP | Feito |
| F3 | Ordens de Serviço (gestor) | MVP | Em andamento |
| F4 | App de campo (técnico, mobile) | MVP | Pendente |
| F5 | Checklists dinâmicos | MVP | Pendente |
| F6 | Assinatura digital + PDF + WhatsApp | MVP | Pendente |
| F7 | Painel gerencial | MVP | Pendente |
| — | Tenant Infoxtec criado manualmente | MVP | Feito |
| F8 | Planos, Asaas, cobrança, trial | Backlog | — |
| — | Auto-cadastro, landing page, anti-fraude | Backlog | — |
| — | Sessão única, validação CPF/CNPJ | Backlog | — |
| F9 | Integração GLPI | Backlog | — |
| F10 | OWASP | pós-MVP | — |
| F11 | Manual + docs | pós-MVP | — |

Nota: "Locais" foi renomeado para "Unidades" na UI (rota /locais e tabela locations mantidas por dentro). F3 é a OS na visão do gestor/escritório; a visão do técnico é a F4 (app de campo mobile).

---

## 4. Estado detalhado da F3 (Ordens de Serviço — gestor)

### Técnicos — COMPLETO
- Técnico é usuário que loga (role tecnico), terá app de campo na F4
- Criação via Edge Function criar-tecnico (admin define senha provisória; técnico troca via reset)
- Tela no padrão DataListView (toggle, busca, chips, ativar/desativar)
- Mensagens de erro amigáveis (e-mail duplicado etc.)
- Validado: técnico loga e vê menu reduzido

### Ordens de Serviço — EM ANDAMENTO
- Migration 005: tabela orders + order_sequences + número sequencial por tenant (OS-0001) + RLS
- Migration 006: coluna completion_notes (relato de conclusão)
- Hook useOrders (listagem + CRUD) e useOrder (detalhe por id)
- Listagem: lista densa (padrão) + toggle para cards + busca + chips por status + clique navega para detalhe
- Criação/edição via modal (comboboxes encadeados: Cliente → Unidades → Técnico)
- Página de detalhe (/os/:id): dados + linha do tempo + ações de status
- Técnico opcional na criação (OS "Aberta" sem técnico = backlog natural)
- Prioridades fixas: Normal, Alta, Urgente

### Fluxo de status da OS (máquina de estados)
- Aberta → Agendar (data+motivo), Iniciar, Cancelar (motivo)
- Agendada → Iniciar, Concluir, Cancelar (motivo)
- Em andamento → Pausar (motivo), Agendar (data+motivo), Concluir, Cancelar (motivo)
- Pausada → Retomar, Concluir, Agendar (data+motivo), Cancelar (motivo)
- Concluída → Reabrir (volta para Em andamento)
- Cancelada → estado final
- Ações com modal: Agendar (data futura + motivo), Pausar (motivo), Cancelar (motivo), Concluir (relato + data/hora ajustável)
- Validações: motivo obrigatório, agendamento só data/hora futura, conclusão não no futuro

### Pendente na F3
- Sistema de comentários na OS (autor + data/hora + texto, na linha do tempo única) — EM CONSTRUÇÃO
- Modal de criação da OS em 2 colunas (refinamento UX) — pendente

---

## 5. Padrões do Projeto (NÃO violar)

### Listagem
DataListView (tabela/cards toggle, busca, chips, linha viva). OS usa lista densa como padrão.

### Ações de listagem (cadastros)
Editar (lápis) + Ativar/Desativar (power, preserva histórico) + coluna Status + chips Todos/Ativos/Inativos.

### Dropdowns
Sempre Combobox com busca (Command + Popover Shadcn) — nunca select simples — para itens dinâmicos.

### Status vs Toggle
Cadastros (cliente/unidade/técnico) = ativo/inativo. OS = máquina de estados.

### Validações
Sempre com mensagem de erro visível e amigável.

### Transferência de arquivos grandes (WSL)
Heredoc com delimitador 'ATOSEOF' (aspas simples — bash não interpreta). Seguro se o conteúdo não tiver a tag a-link literal. Validar balanceamento de chaves/parênteses após criar. Para arquivos grandes, dividir em 2 comandos (cat > e cat >>).

---

## 6. Migrations Aplicadas (DEV)

| Arquivo | Conteúdo | DEV | PRD |
|---------|----------|-----|-----|
| 001_f1_multitenant | tenants, users, triggers, RLS inicial | OK | Pendente |
| 002_fix_rls_recursion | funções get_meu_role/get_meu_tenant (SECURITY DEFINER) | OK | Pendente |
| 003_f2_clients_locations | tabelas clients, locations + RLS | OK | Pendente |
| 004_f2_unidade_principal | is_primary + trigger unidade principal | OK | Pendente |
| 005_f3_orders | orders, order_sequences, número sequencial, RLS | OK | Pendente |
| 006_f3_completion_notes | coluna completion_notes em orders | OK | Pendente |

---

## 7. BACKLOG

### Levantado na tabela oficial (pós-MVP)
- [ ] F8: Planos, Asaas, cobrança, trial
- [ ] Auto-cadastro, landing page, anti-fraude
- [ ] Sessão única, validação CPF/CNPJ
- [ ] F9: Integração GLPI
- [ ] F10: OWASP
- [ ] F11: Manual + docs

### Levantado durante o desenvolvimento
- [ ] Sistema de comentários na OS (autor + data/hora + texto) — EM CONSTRUÇÃO na F3
- [ ] Portal do Solicitante/Cliente — área onde o contato do cliente acompanha e comenta as OS dele (quando existir, o solicitante vira tipo de usuário e pode comentar)
- [ ] Modal de criação da OS em 2 colunas (refinamento UX)
- [ ] Modal/página de cliente com gestão de unidades embutida (abas Dados/Unidades)
- [ ] Criação de técnicos via convite por e-mail (inviteUserByEmail)
- [ ] Módulo de SLA + status e prioridades configuráveis por tenant
- [ ] Aplicar todas as migrations no PRD ao replicar
- [ ] Campo "nome fantasia/exibição" no tenant (nome longo cortado na sidebar)
- [ ] Ajuste de contraste do ícone ATOS na sidebar

---

*Última atualização: F3 em andamento — Técnicos completos; OS com listagem, status, página de detalhe e conclusão com relato. Próximo: sistema de comentários na OS.*
