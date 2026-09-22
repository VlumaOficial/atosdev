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
| F5 | Checklists dinâmicos | MVP | Feito |
| F6 | Assinatura digital + PDF + WhatsApp | MVP | Em andamento (Bloco A feito) |
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

## 4.2. Estado detalhado da F5 (Checklists) — CONCLUÍDA

### Checklists vinculados a uma OS — COMPLETO
- Migrations 010-011: checklist_templates, checklist_template_items, checklist_instances, checklist_instance_targets, checklist_answers + RLS
- Editor de modelo (ChecklistEditorPage): itens arrastáveis (dnd-kit), cada item com um ou mais campos de resposta (sim/não, texto, número, escolha única, escolha múltipla, foto), item marcável como obrigatório
- Associação do checklist à OS na criação/edição (combobox de modelo, igual padrão Cliente/Unidade/Técnico)
- Preenchimento pelo técnico ou gestor: parcial (salva progresso, permite voltar depois), itens recolhíveis, indicador de obrigatórios pendentes
- Migration 012: Realtime em checklist_instances (reabertura pelo admin aparece pro técnico sem refresh)
- Bloqueio de conclusão da OS com checklist obrigatório pendente (checklistGuard.ts)

### Rastreabilidade das respostas — COMPLETO
- Migration 013: tabela checklist_answer_history + trigger no banco (fn_checklist_answer_history) — grava o estado ANTERIOR sempre que uma resposta já salva é alterada, capturando quem mudou
- Reabertura de checklist concluído: só admin/gestor
- Pendente (backlog 9.7 do VISAO_ATOS.md): tela de consulta desse histórico

### Evidências fotográficas — COMPLETO (base, sem carimbo ainda)
- Migration 014: bucket privado `evidencias` (5MB, RLS por tenant via pasta = tenant_id)
- Compressão no navegador antes do upload (FotoEvidencia.tsx), URL assinada
- Carimbo (logo/GPS/data na foto) fica para a F6, junto com assinatura digital e PDF

### Checklist avulso (sem OS) — COMPLETO — 2026-09-22
- A visão original (VISAO_ATOS.md) previa checklist independente de OS (vistoria, inspeção, levantamento); schema já tinha `context_type`/`recurrence`/`checklist_instance_targets` reservados desde a F5 original, mas sem uso em código
- Migration 016: `client_id`/`location_id` nullable em checklist_instances (vínculo opcional a Cliente/Unidade, mesmo padrão de checklist_templates.client_id = "geral" quando vazio)
- `useChecklistInstance` generaliza o antigo `useOrderChecklist` (aceita orderId OU instanceId) — checklist-em-OS e avulso compartilham o mesmo núcleo de preenchimento/conclusão/reabertura sem duplicar lógica
- Componentes de preenchimento extraídos para src/components/checklists/ (checklistFields.tsx, ChecklistFillList.tsx), reaproveitados pelos dois fluxos
- Admin: página `/checklists/avulsos` (criação com Combobox Cliente→Unidade, MultiCombobox de técnicos — componente novo, `src/components/ui/multi-combobox.tsx` — e modelo de checklist; recorrência como etiqueta de texto livre, sem geração automática)
- Técnico: nova aba "Checklists" em FieldLayout (ao lado de "Atendimentos"), lista MyChecklistsPage + preenchimento em tela cheia FieldChecklistPage
- Testado ponta a ponta com Playwright na URL pública (login real, criar/preencher/concluir, mais regressão do checklist-em-OS) — ver commits `442df97` e `c99daf1`. Um bug real foi encontrado e corrigido nesse teste (combobox de Unidade listava todas as unidades do tenant mesmo sem cliente escolhido)

---

## 4.3. Estado detalhado da F6 (Assinatura, evidências, PDF, envio) — EM ANDAMENTO

F6 dividida em blocos (A a E) para não planejar/entregar tudo de uma vez —
ver `VISAO_ATOS.md` seção "F6" para o escopo completo de cada bloco.

### Bloco A — Assinatura digital — CONCLUÍDO (2026-09-22)
- Migration 017: `orders.signature_path/signer_name/signed_at`,
  `tenants.require_signature_to_complete` (default false)
- Migration 018: função `atualizar_config_tenant()` (SECURITY DEFINER) —
  **achado testando**: policy de RLS de `tenants` só libera UPDATE pra
  `super_admin`; um `admin` normal não conseguia salvar Configurações
  (silenciosamente, sem erro — RLS filtra a linha, não retorna 403).
  Corrigido com função seção de UPDATE controlado, sem abrir policy geral
  (evita admin poder editar `plan`/`status`, campos comerciais)
- Componente `OrderSignature` (src/components/orders/) — captura por
  toque/mouse com `signature_pad`, aparece em `OrderDetailPage` (admin,
  só leitura) e `FieldOrderPage` (técnico, onde captura de fato)
- Armazenamento reaproveita o bucket `evidencias` já existente (F5),
  path `{tenant}/assinaturas/{orderId}.png`
- Primeira versão real da tela **Configurações** (era só placeholder):
  toggle "Exigir assinatura do cliente para concluir OS", por tenant
- Evento `signed` na linha do tempo da OS
- Testado ponta a ponta com Playwright: bloqueio de conclusão sem
  assinatura quando o toggle está ligado, captura + conclusão com
  assinatura, visualização no painel admin, e regressão (toggle
  desligado = comportamento antigo preservado)

### Extensão — Assinatura obrigatória por OS (2026-09-22)
- Migration 019: `orders.require_signature` (nullable) — `null` = usa o
  padrão do tenant, `true`/`false` força exigir/não exigir nessa OS
  específica, independente do toggle em Configurações
- Combobox "Assinatura obrigatória" no modal de criar/editar OS
  (`OrdersPage.tsx`), 3 opções: Padrão do tenant / Exigir / Não exigir
- Testado ponta a ponta os 3 cenários (padrão segue o toggle; força
  exigir bloqueia mesmo com toggle desligado; força não exigir libera
  mesmo com toggle ligado)

### Bloco B — Carimbo em evidências + LGPD — CONCLUÍDO (2026-09-22)
- Sem migration de schema pra GPS/logo (decisão de privacidade: a
  coordenada só existe dentro do pixel da foto, nunca separada no
  banco). Migration 020 foi necessária por outro motivo (ver achado
  abaixo).
- Fotos do campo "foto" do checklist (F5) passam a sair carimbadas:
  logo da empresa + nome do tenant + data/hora + coordenadas GPS,
  desenhadas no mesmo canvas da compressão (`src/lib/uploadEvidencia.ts`)
- GPS lido sob demanda (`getCurrentPosition`, `maximumAge: 0`), nunca
  `watchPosition` — `src/lib/geolocation.ts`
- LGPD: modal de consentimento na primeira foto (aceite gravado em
  `users.preferences.location_consent_at`), página pública
  `/privacidade` com aviso completo, bloqueio com "Tentar novamente"
  se a localização for negada (obrigatório, não é opcional como a
  assinatura)
- Logo da empresa configurável em Configurações — path fixo
  `{tenant}/logo.png` no bucket `evidencias` já existente, sem coluna
  nova (a existência do arquivo já é a config)
- **Achado testando**: mesma classe de bug da migration 018 — RLS de
  `public.users` só libera UPDATE pra admin/super_admin, então nem o
  próprio usuário conseguia salvar sua coluna `preferences` (afetava
  também `useViewPreference.ts`, preexistente). Migration 020: função
  `atualizar_minhas_preferencias()` (SECURITY DEFINER, restrita a
  `id = auth.uid()`)
- **Achado pelo usuário em produção (DEV)**: "Trocar logo" quebrava com
  "new row violates row-level security policy" — o bucket `evidencias`
  (migration 014) só tinha policies de SELECT/INSERT/DELETE, faltava
  UPDATE. Upload com `upsert:true` (logo, e também a assinatura em
  `uploadSignature.ts`) faz UPDATE quando o arquivo já existe no path —
  funcionava na primeira vez, quebrava da segunda em diante. Migration
  021 adiciona a policy `evidencias_update`. Só policy, sem mudança de
  código — re-testado trocando a logo duas vezes seguidas, confirmado ok
- Testado ponta a ponta: upload de logo, carimbo aparecendo
  corretamente na foto (logo+nome+data+GPS visíveis), consentimento
  persistindo, e bloqueio confirmado com permissão de GPS negada

### Extensão — Evidências fotográficas independentes de checklist (2026-09-22)
- **Achado pelo usuário em produção (OS-0010)**: OS sem checklist
  associado não tinha nenhum lugar pra anexar foto — o único mecanismo
  existente era o campo "foto" dentro de um item de checklist
- Migration 022: tabela `order_evidences` (RLS idêntica a
  `order_comments`) — foto + observação direto na OS, sem depender de
  checklist
- Reaproveita 100% a infra do Bloco B sem duplicar código: mesma função
  de carimbo (`comprimirECarimbar`), mesmo modal de consentimento,
  mesmo wrapper de GPS — só uma nova porta de upload
  (`uploadEvidenciaOS`, path `{tenant}/os/{orderId}/...`)
- Novo card "Evidências fotográficas" em `FieldOrderPage` (editável) e
  `OrderDetailPage` (somente leitura), com observação por foto editável
  e remoção (autor ou admin)
- Testado ponta a ponta direto na OS-0010 real do usuário: card passou
  a aparecer, upload+carimbo ok, observação persiste, GPS negado
  bloqueia igual ao fluxo do checklist, visão admin confirmada
- **Achado pelo usuário testando por celular real**: erro de "falta de
  memória" ao anexar foto. Causa: `createImageBitmap(file)` decodifica
  a foto em **resolução total** antes de redimensionar — uma foto de
  câmera moderna (12MP+) pode estourar memória em aparelhos mais fracos
  nesse passo, antes mesmo de chegar no canvas de compressão. Corrigido
  em `uploadEvidencia.ts`/`uploadLogo.ts`: acima de 2MB, usa
  `createImageBitmap(file, { resizeWidth, resizeQuality })` — decodifica
  já redimensionado, num passo só, nunca materializando a imagem em
  resolução total; `bitmap.close()` libera a memória assim que copiado
  pro canvas. Sem migration, só código. Testado com foto sintética de
  14MB/4032×3024 (mesma ordem de grandeza de uma foto real de celular)
  em perfil mobile emulado — sem erro.

### Próximos blocos
- **C** — Geração do PDF (dados da OS + checklist + evidências + assinatura)
- **D** — Envio (WhatsApp/e-mail) — **pendente de detalhamento técnico**:
  painel multi-tenant com QR Code para conectar instância Evolution
  própria de cada cliente (ver nota em `VISAO_ATOS.md`, seção F6)
- **E** — Painel do gestor (disparo manual) + controle admin de bloqueio

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

> **2026-09-22:** migrations 004–015 estavam aplicadas no banco DEV mas nunca
> tinham sido salvas como arquivo (SQL colado direto no Dashboard). Foram
> reconstruídas por introspecção do schema real e agora estão versionadas em
> `supabase/migrations/`. Ver `supabase/migrations/README.md` para o detalhe
> dessa reconstrução. Nenhuma informação de fase/funcionalidade foi perdida —
> o agrupamento dos arquivos segue as fases já descritas neste documento.

| Arquivo | Conteúdo | DEV | PRD | Versionado no git |
|---------|----------|-----|-----|--------------------|
| 001_f1_multitenant | tenants, users, triggers, RLS inicial | OK | Pendente | Sim |
| 002_fix_rls_recursion | funções get_meu_role/get_meu_tenant (SECURITY DEFINER) | OK | Pendente | Sim |
| 003_f2_clients_locations | tabelas clients, locations + RLS | OK | Pendente | Sim |
| 004_f2_unidade_principal | is_primary + trigger unidade principal | OK | Pendente | Sim (reconstruída) |
| 005_f3_orders | orders, order_sequences, número sequencial, RLS | OK | Pendente | Sim (reconstruída) |
| 006_f3_completion_notes | coluna completion_notes em orders | OK | Pendente | Sim (reconstruída) |
| 007_f3_order_comments | tabela order_comments + RLS | OK | Pendente | Sim (reconstruída) |
| 008_f3_order_events | tabela order_events (histórico imutável com autor) + RLS | OK | Pendente | Sim (reconstruída) |
| 009_f4_realtime_orders | Realtime + REPLICA IDENTITY FULL em orders | OK | Pendente | Sim (reconstruída) |
| 010_f5_checklist_templates | checklist_templates, checklist_template_items + RLS | OK | Pendente | Sim (reconstruída) |
| 011_f5_checklist_instances | checklist_instances, checklist_instance_targets, checklist_answers + RLS | OK | Pendente | Sim (reconstruída) |
| 012_f5_checklist_realtime | Realtime + REPLICA IDENTITY FULL em checklist_instances | OK | Pendente | Sim (reconstruída) |
| 013_f5_checklist_answer_history | checklist_answer_history + trigger de versionamento (rastreabilidade) | OK | Pendente | Sim (reconstruída) |
| 014_f5_evidencias_storage | bucket privado "evidencias" + RLS de storage.objects por tenant | OK | Pendente | Sim (reconstruída) |
| 015_keepalive | tabela keepalive_ping (anti-suspensão Supabase free) | OK | Pendente | Sim (reconstruída) |
| 016_f5_checklist_avulso | client_id/location_id nullable em checklist_instances (checklist sem OS) | OK | Pendente | Sim |
| 017_f6_assinatura | orders.signature_path/signer_name/signed_at, tenants.require_signature_to_complete | OK | Pendente | Sim |
| 018_f6_config_tenant_rpc | função atualizar_config_tenant() (SECURITY DEFINER) — corrige admin sem permissão de UPDATE em tenants | OK | Pendente | Sim |
| 019_f6_assinatura_por_os | orders.require_signature (nullable) — override por OS do padrão do tenant | OK | Pendente | Sim |
| 020_f6_preferencias_rpc | função atualizar_minhas_preferencias() (SECURITY DEFINER) — corrige usuário sem permissão de UPDATE na própria linha em users | OK | Pendente | Sim |
| 021_f6_storage_update_policy | policy evidencias_update em storage.objects — corrige "Trocar logo"/re-upload no mesmo path | OK | Pendente | Sim |
| 022_f6_order_evidences | tabela order_evidences (foto+observação direto na OS, sem depender de checklist) + RLS | OK | Pendente | Sim |

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

*Última atualização: F5 CONCLUÍDA (checklists dinâmicos completos — modelos, preenchimento vinculado à OS, rastreabilidade de respostas, evidências fotográficas, e checklist avulso sem OS com vínculo opcional a cliente/unidade e atribuição a múltiplos técnicos). Testado ponta a ponta na URL pública. DECISÃO: completar MVP (F6-F7) antes de subir para PRD.*

*2026-09-22: F6 Bloco A (assinatura digital) CONCLUÍDO e testado ponta a ponta — ver seção 4.3, incluindo extensão de assinatura obrigatória configurável por OS.*

*2026-09-22: F6 Bloco B (carimbo de evidências + LGPD) CONCLUÍDO e testado ponta a ponta — ver seção 4.3. Logo de teste (placeholder) ficou configurada em Configurações — trocar pela logo real da Infoxtec quando quiser.*

*2026-09-22: evidências fotográficas passam a existir direto na OS, independentes de checklist (achado reportado pelo usuário na OS-0010 real) — ver seção 4.3. Também corrigida policy de UPDATE faltante no bucket `evidencias` (afetava "Trocar logo"). Próximo: Bloco C (PDF).*

*2026-09-22: migrations 004–016 reconstruídas/adicionadas e versionadas em `supabase/migrations/` (ver seção 6). Achados de segurança pendentes (token de acesso do Supabase usado nessas migrations, e Personal Access Token do GitHub embutido no remote git da pasta `C:\vluma\atosdev`) — revogar/trocar ambos **ao final de todo o desenvolvimento do MVP**, não antes (decisão do time, para não gerar atrito de credencial a cada sessão de trabalho).*
