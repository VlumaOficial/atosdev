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
| F3 | Ordens de Serviço (gestor) | MVP | Feito |
| F4 | App de campo (técnico, mobile) | MVP | Feito |
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

## 4. Estado detalhado da F3 (Ordens de Serviço — gestor) — CONCLUÍDA

### Técnicos — COMPLETO
- Técnico é usuário que loga (role tecnico), terá app de campo na F4
- Criação via Edge Function criar-tecnico (admin define senha provisória; técnico troca via reset)
- Tela no padrão DataListView (toggle, busca, chips, ativar/desativar)
- Mensagens de erro amigáveis (e-mail duplicado etc.)
- Validado: técnico loga e vê menu reduzido

### Ordens de Serviço — COMPLETO
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

### Extras concluídos na F3
- Migration 007: tabela order_comments + RLS por tenant
- Sistema de comentários na OS (autor + data/hora + texto) — hook useOrderComments + UI na página de detalhe
- Modal de criação da OS em 2 colunas (Cliente+Unidade, Técnico+Prioridade; Título e Descrição em largura total)

---

## 4.1. Estado detalhado da F4 (App de campo do técnico — mobile) — CONCLUÍDA

### Experiência dedicada do técnico
- Layout próprio mobile (FieldLayout) — sem sidebar do gestor; cabeçalho ATOS Campo + nome + sair
- Ao logar, técnico é redirecionado para /campo (HomeRedirect por role); demais vão ao painel
- Técnico vê APENAS as OS atribuídas a ele (technician_id = user.id)

### Tela "Meus atendimentos" (MyOrdersPage)
- Saudação contextual por horário (Bom dia/tarde/noite) + primeiro nome + frase de boas-vindas
- Dashboard de status: cartões com contadores (Todas + Aberta/Em andamento/Agendada/Pausada/Concluída/Cancelada) que FILTRAM a lista ao tocar
- Toggle lista compacta / cards
- Lista ordenada por prioridade

### Detalhe da OS no campo (FieldOrderPage)
- Cabeçalho (número, status, título, prioridade), dados do cliente/unidade
- Endereço + botão "Abrir no mapa" (Google Maps via link; abre app nativo no celular)
- Ações de status do técnico: Iniciar, Pausar, Retomar, Agendar, Concluir, Cancelar
- Linha do tempo e comentários (componentes compartilhados)

### Atualização em tempo real (Supabase Realtime)
- Lista e detalhe do técnico atualizam SEM refresh quando o admin cria/altera uma OS
- Requisitos: tabela orders na publicação supabase_realtime + REPLICA IDENTITY FULL (crítico)
- Hooks: useMyOrders e useOrder com subscription; recarregam em qualquer mudança (o fetch filtra por técnico)

### Rastreabilidade real — linha do tempo (REFORMULAÇÃO ARQUITETURAL)
- PROBLEMA resolvido: a linha do tempo antiga era montada de campos fixos (pause_reason, scheduled_at) que se SOBRESCREVIAM — perdia histórico e não registrava o autor
- SOLUÇÃO: tabela order_events (migration 008) — registra TODO evento de forma IMUTÁVEL, com autor (snapshot), tipo, detalhes (JSON) e data
- Helper centralizado registrarEvento() (src/lib/orderEvents.ts) — captura o autor do usuário logado; não bloqueia a ação se falhar
- Eventos registrados: created, started, paused, resumed, scheduled, completed, cancelled, reopened, transferred, edited
- A OS pode ser alterada pelo técnico, pelo admin, ou transferida para outro técnico — tudo fica registrado com quem fez
- Linha do tempo EXIBE a jornada (status + transferências + autor); oculta "edited" (fica no banco para auditoria/futura aba de histórico completo)

### Componentes compartilhados (admin + técnico)
- src/components/orders/OrderTimeline.tsx — lê order_events; traduz cada tipo em frase amigável (Criada/Agendada/Iniciada/Pausada/Retomada/Concluída/Cancelada/Reaberta/Transferida) com ícone + autor + data + detalhes; RECOLHÍVEL (mostra "X eventos · última: ...", expande ao tocar)
- src/components/orders/OrderComments.tsx — campo de escrever sempre visível; lista de comentários RECOLHÍVEL com contador + prévia do último

### Segurança — logout por inatividade
- Hook useIdleTimeout(30) em AppLayout e FieldLayout (30 min)
- Robusto a abas em segundo plano: usa timestamp da última interação + checagem periódica (15s) + ao reganhar foco (não depende só de setTimeout, que o navegador pausa)

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
Heredoc com delimitador 'ATOSEOF' (aspas simples — bash não interpreta). Seguro se o conteúdo não tiver a tag a-link literal. Validar balanceamento de chaves/parênteses após criar. Para arquivos grandes, dividir em 2 comandos (cat > e cat >>). Arquivos com tag a-link literal: usar base64 via /tmp em 2 metades. ATENÇÃO: nunca rodar o mesmo comando Python/heredoc duas vezes (duplica imports/funções e quebra o build com TS2300/TS2393).

### Realtime (Supabase)
Para uma tabela atualizar a tela sem refresh: (1) alter publication supabase_realtime add table; (2) alter table ... replica identity full (CRÍTICO); (3) subscription no hook recarregando em qualquer evento.

### Componentes compartilhados
Lógica usada em admin + técnico fica em src/components/orders/ (ex.: OrderTimeline, OrderComments). Editar num lugar só.

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
| 007_f3_order_comments | tabela order_comments + RLS | OK | Pendente |
| 008_f3_order_events | tabela order_events (histórico imutável com autor) + RLS | OK | Pendente |

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
- [ ] Portal do Solicitante/Cliente — área onde o contato do cliente acompanha e comenta as OS dele (quando existir, o solicitante vira tipo de usuário e pode comentar)
- [ ] Modal/página de cliente com gestão de unidades embutida (abas Dados/Unidades)
- [ ] Criação de técnicos via convite por e-mail (inviteUserByEmail)
- [ ] Módulo de SLA + status e prioridades configuráveis por tenant
- [ ] Aplicar todas as migrations no PRD ao replicar
- [ ] Campo "nome fantasia/exibição" no tenant (nome longo cortado na sidebar)
- [ ] Ajuste de contraste do ícone ATOS na sidebar
- [ ] **Responsividade do painel admin (acabamento pré-PRD, após F5-F7):** sidebar → menu hambúrguer; listagens no mobile com LISTA COMPACTA como padrão (não cards) + busca/filtros fortes, toggle para cards opcional; revisar modais. Aplicar em OS, Clientes, Unidades, Técnicos e Checklists
- [ ] Aba "auditoria/histórico completo" da OS (mostrar também os eventos 'edited' ocultos da linha do tempo)
- [ ] Auto-atribuição: técnico pegar OS do backlog (Aberta sem técnico) — F4+
- [ ] Mapa visual embutido na tela do técnico (hoje só botão "Abrir no mapa")

---

*Última atualização: F4 CONCLUÍDA (app de campo mobile, dashboard de status, Realtime, rastreabilidade real via order_events com autor, linha do tempo e comentários recolhíveis compartilhados, logout por inatividade). DECISÃO: completar MVP (F5-F7) antes de subir para PRD. Próximo: F5 — Checklists dinâmicos.*
