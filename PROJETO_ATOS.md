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
| Pastas locais | /home/sdorea/vluma/atosdev (WSL) e /mnt/c/vluma/atosdev (Windows) — manter as duas sincronizadas (corrigido em 2026-09-23; antes apontava para /mnt/c/Users/sdore/dyad-apps/atosdev, pasta antiga) |
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
| F6 | Assinatura digital + PDF + WhatsApp | MVP | Em andamento — **atualizado 2026-09-24:** Blocos A, B, C, D (níveis Básico e Intermediário) e E feitos; falta o nível Avançado do D (WhatsApp automático via Evolution, a refinar com o usuário). Antes dizia: "Blocos A e B feitos; bug de memória…" (bug resolvido em 2026-09-23) |
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
  Corrigido com função SECURITY DEFINER de UPDATE controlado, sem abrir policy geral
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
  nesse passo, antes mesmo de chegar no canvas de compressão.
  **Primeira correção (insuficiente)**: só aplicava o decode
  redimensionado quando `file.size > 2MB`. **Usuário reportou que o
  erro persistiu** testando de novo com a câmera real — gap
  encontrado: câmeras de celular comprimem bem, uma foto de 12MP+ pode
  sair com menos de 2MB em bytes, então o gate por tamanho de arquivo
  simplesmente não disparava para fotos assim, e o decode continuava
  em resolução total. **Correção final**: removido o gate — SEMPRE usa
  `createImageBitmap(file, { resizeWidth, resizeQuality })` (com
  fallback pro modo normal se o navegador não suportar), já que o
  tamanho do arquivo não é indicador confiável de resolução.
  `bitmap.close()` libera a memória assim que copiado pro canvas. Sem
  migration, só código. Testado com duas fotos sintéticas em perfil
  mobile emulado: 14MB/4032×3024 (arquivo grande) e 218KB/4032×3024
  bem comprimida (o cenário exato que escapava da primeira correção) —
  ambas sem erro. **Limitação da verificação**: o ambiente de teste é
  Chromium desktop headless, não reproduz de verdade a restrição de
  memória de um aparelho físico específico — validação final depende
  de teste no celular real do usuário.

### ✅ BUG — "falta de memória" ao anexar evidência — RESOLVIDO (validado no celular real do usuário em 2026-09-23)
**Atualização 2026-09-23 (validação): usuário anexou foto pelo celular real com a câmera embutida, sem o erro. Título anterior: "CORREÇÃO IMPLEMENTADA, aguardando validação no celular real".**
**Status em 2026-09-23 (início da sessão): diagnosticado, correção NÃO implementada ainda.**
**Atualização 2026-09-23 (mesma data, sessão seguinte): câmera embutida implementada — ver "Correção implementada" ao fim desta seção. Histórico do diagnóstico mantido abaixo.**

- Usuário reportou que o erro **persistiu** mesmo após as duas correções
  acima (que otimizam o processamento da imagem já dentro do
  JavaScript do app)
- **Print do erro real (celular do usuário) mudou o diagnóstico**: a
  seção "Evidências fotográficas" aparece **vazia** (nenhuma foto
  anexada, nem a mensagem de erro que o próprio app mostra) — em vez
  disso, um **toast do sistema Android/navegador** flutua sobre a
  página: *"Devido à insuficiência de memória, não foi possível
  concluir a operação anterior"*. Esse texto não existe em nenhum
  lugar do código do ATOS
- **Conclusão**: a falha não acontece mais dentro do código que já foi
  otimizado (`comprimirECarimbar`) — acontece **antes**, na troca
  (handoff) entre o app de Câmera nativo do Android e o navegador.
  Em aparelhos com pouca RAM livre, o Android mata/recarrega a aba do
  navegador para liberar memória pro app de Câmera, e isso é a nível
  de sistema operacional — **nenhuma otimização de JavaScript no app
  consegue interceptar ou evitar isso**, porque o crash acontece fora
  do processo da página
- **Correção proposta (ainda não implementada, aguardando decisão do
  usuário)**: trocar `<input type="file" capture="environment">`
  (que invoca o app de Câmera nativo pesado) por uma câmera **embutida
  na própria página** via `getUserMedia()` — captura o frame
  diretamente num `<video>`/`<canvas>` da página, com resolução
  controlada pelo próprio app, nunca abrindo um processo externo nem
  fazendo esse handoff pesado. É uma mudança de UX real (visor de
  câmera na tela em vez do botão simples atual), não um ajuste pontual
  — por isso não foi implementada sem confirmação
- Afeta tanto `FotoEvidencia.tsx` (foto do checklist) quanto
  `OrderEvidences.tsx` (evidência da OS) — os dois usam o mesmo padrão
  de `<input capture="environment">`
- **Próximo passo**: perguntar ao usuário se quer seguir com essa
  reformulação (câmera embutida) — é o item nº1 de pendência pra
  próxima sessão

**Correção implementada (2026-09-23)** — aprovada pelo usuário ("se como
Engenheiro/PO/UX entende que é a melhor solução, vamos seguir"):
- Componente novo `src/components/orders/CameraCaptura.tsx`: visor em
  tela cheia (`getUserMedia`, câmera traseira, resolução ideal
  1920×1080), botão de disparo, prévia com "Tirar outra" / "Usar foto".
  A foto é um frame do `<video>` copiado pra canvas — nenhum app externo
  é aberto, não há o handoff que fazia o Android matar a aba
- O stream é encerrado (`track.stop()`) ao usar a foto, fechar ou
  desmontar — câmera não fica ligada em segundo plano
- `FotoEvidencia.tsx` e `OrderEvidences.tsx` trocam o
  `<input capture>` por um botão que abre o `CameraCaptura`. Resto do
  fluxo inalterado: mesma `comprimirECarimbar`, mesmo GPS pontual, mesmo
  upload
- **Decisão de UX**: o consentimento de localização (LGPD) passou a ser
  pedido ANTES de abrir a câmera (antes era depois de escolher o
  arquivo) — evita o técnico tirar a foto e só então descobrir que
  precisa aceitar
- **Decisão de produto**: sem opção "escolher da galeria". O carimbo
  grava data/GPS do momento do envio; foto antiga da galeria sairia
  carimbada como se fosse atual — comprometeria o valor de prova da
  evidência
- **Fallback**: se o navegador não suportar `getUserMedia` ou não
  achar câmera, o próprio visor oferece "Abrir câmera do aparelho"
  (o `<input capture>` antigo) — nunca deixa o técnico sem conseguir
  anexar. Permissão de câmera negada mostra mensagem + "Tentar novamente"
  + link secundário "Usar a câmera do aparelho" (o app nativo não depende
  da permissão do site — acrescentado no mesmo dia após o teste, pra não
  deixar o técnico travado se negou a câmera por engano)
- Mensagem de erro de upload deixou de sugerir "use foto da galeria"
  (opção que não existe mais)
- **Achado testando (Playwright, mesmo dia)**: no checklist a câmera
  abria mas o botão de disparo não respondia — o preenchimento do
  checklist roda dentro de um Dialog modal do Radix, que bloqueia
  clique em tudo fora dele, e o visor era um `createPortal` comum no
  `body`. Corrigido tornando o visor um Dialog do Radix também (Dialogs
  aninhados empilham certo). A evidência direto na OS não era afetada
  (não fica dentro de modal)
- **Testado ponta a ponta (Playwright, URL pública, técnico real,
  perfil Pixel 5, câmera simulada do Chromium)**: (1) evidência da OS —
  visor abre a 1920×1080, prévia, "Tirar outra" volta ao vivo, "Usar
  foto" envia com carimbo (logo+nome+data+GPS conferidos na imagem
  salva), câmera desligada (`track.readyState = ended`) ao usar e ao
  fechar no X, nenhum `input[capture]` na página; (2) foto de item de
  checklist dentro do modal (OS de teste "Teste camera embutida
  (checklist)", criada pelo admin) — ok após o fix do Dialog; (3)
  permissão negada (`NotAllowedError` real via CDP) — mensagem +
  "Tentar novamente" + link secundário, upload pelo link ok; (4)
  navegador sem `getUserMedia` — fallback aparece e envia. Zero erros
  de console. **Limitação**: câmera simulada não reproduz a pressão de
  memória nem a orientação retrato de um celular físico — validação
  final no aparelho real do usuário

### 🔴 ACHADO — carimbo "invisível"/ilegível em foto retrato (2026-09-23, validação no celular real)
- A primeira foto real em **retrato** (1600×2845) saiu **com** carimbo
  (logo+nome+data+GPS real conferidos baixando o arquivo do storage),
  mas o usuário não o viu. Duas causas:
  1. Miniatura em `OrderEvidences.tsx` usa `h-40 object-cover` —
     recorta o centro e esconde a faixa inferior em fotos retrato (as
     fotos de teste eram paisagem, por isso passou despercebido)
  2. Layout do carimbo em `comprimirECarimbar` não é proporcional: faixa
     e logo escalam pela ALTURA (14%), texto é fixo em 13px — em retrato
     a logo fica gigante e o texto minúsculo
- **Próximo passo**: usuário vai enviar um modelo de como espera o
  carimbo; redesenhar carimbo proporcional (retrato e paisagem) +
  miniatura que mostre o carimbo, juntos

### Carimbo v2 + ver/baixar evidência — Incremento 1 (2026-09-23)
**Atualização do achado acima: usuário enviou modelo (estilo app
Timemark) e aprovou o plano em 3 incrementos — ver VISAO_ATOS.md, F6.**
- `desenharCarimbo()` em `src/lib/uploadEvidencia.ts` substitui a faixa
  escura: texto branco com sombra + degradê leve na base; canto inferior
  esquerdo com logo em cartão branco (proporção preservada — antes era
  esticada num quadrado), hora em destaque, divisor amarelo, data + dia
  da semana, endereço (slot pronto, preenchido no Incremento 2) e
  coordenadas em linha pequena; canto superior direito com a marca
  "ATOS · Gestão de Campo". Tudo proporcional ao MENOR lado da foto
  (igual em retrato e paisagem). Sem logo, cai para o nome da empresa
- Miniatura em `OrderEvidences` passa de `object-cover` para
  `object-contain` (foto inteira, carimbo visível)
- Novo `EvidenceViewer.tsx`: tocar na foto abre em tela cheia sem
  recorte + botão **Baixar** (URL assinada com `download`, arquivo
  carimbado). Vale para técnico e admin, evidência da OS e foto de
  checklist. Dialog do Radix (abre de dentro do modal do checklist)
- Sem migration
- Testado ponta a ponta (Playwright, URL pública, técnico real): foto
  retrato real 1600×2400 (recorte da foto do usuário) e paisagem
  1920×1080 (câmera simulada) — carimbo proporcional e legível nas duas,
  miniatura mostra a foto inteira, visualizador abre/fecha, download com
  `Content-Disposition: attachment` e evento de download do navegador ok

### Endereço no carimbo — Incremento 2 (2026-09-23)
- `src/lib/geocodificacao.ts` → `obterEndereco(coords)`: Nominatim
  público (OpenStreetMap), timeout 5s, máx. 1 req/s (política do
  Nominatim), cache em memória por ~11 m. Chamado em paralelo com os
  dados do tenant no upload; **nunca bloqueia** (falhou → só coordenadas)
- **Desvio do plano, registrado**: o combinado era Edge Function, mas o
  único token Supabase disponível na máquina pertence a outra conta (não
  enxerga o projeto ATOS) — sem como publicar function. A chamada sai do
  navegador, isolada nesse único arquivo; vira Edge Function junto com a
  decisão do provedor SaaS (provedor pago exige esconder a chave de
  qualquer forma)
- **Decisão de produto (achado testando)**: carimbo mostra só rua,
  bairro, cidade, UF e CEP. Nome do local e número ficam de fora — com as
  coordenadas da foto real do usuário o Nominatim devolveu o colégio
  vizinho e número 1 (o real era Condomínio Shopping Conexão, nº 27).
  Endereço errado numa prova é pior que incompleto
- Aviso `/privacidade` atualizado: coordenada enviada ao OpenStreetMap
  só para converter em endereço, sem nome/e-mail/dados da OS
- Sem migration
- Testado ponta a ponta (URL pública, técnico real, coordenadas reais da
  foto do usuário): carimbo sai com "Rua Silveira Martins - Cabula,
  Salvador - BA, 41150-000" + coordenadas; com o Nominatim bloqueado
  (simulando sem internet) a foto é anexada normalmente, só com
  coordenadas, sem mensagem de erro

### Consentimento de localização versionado (2026-09-23)
- **Achado pelo usuário no celular real**: depois do Incremento 2 a foto
  não pediu novo aceite — o app só checava se EXISTIA um aceite
  (`location_consent_at`), sem saber de qual texto
- `useLocationConsent` passa a gravar `users.preferences.
  location_consent_version` e compara com `VERSAO_TERMO_LOCALIZACAO`
  (hoje = 2). Aceite antigo sem versão conta como v1 → modal reaparece
  com o título "Aviso de localização atualizado" e uma faixa explicando
  o que mudou (endereço via OpenStreetMap). Texto do modal ganhou o
  parágrafo do endereço
- Regra daqui em diante: mudança relevante no tratamento de localização
  = subir a versão (histórico das versões comentado no hook)
- Sem migration (preferences já é jsonb gravado via
  `atualizar_minhas_preferencias()`, migration 020)
- Testado (URL pública, técnico real com aceite v1): ao tocar em
  "Adicionar evidência" o modal "Aviso de localização atualizado"
  aparece com a faixa e o parágrafo do OpenStreetMap, câmera NÃO abre
  antes do aceite, "Agora não" fecha sem abrir câmera. **O aceite em si
  NÃO foi feito no teste de propósito** — sem token do Supabase não dava
  pra desfazer, e o usuário precisa ver o termo novo no celular real.
  Persistência do aceite v2 fica para o teste do usuário
- **Token do Supabase enviado pelo usuário em 2026-09-23 voltou 401
  (Unauthorized) em todos os endpoints** — aguardando token válido para
  as migrations dos Incrementos 3 e 4
  → **Atualização 2026-09-23: usuário enviou token novo, válido.**
  Conferido no banco que o aceite v2 do termo foi gravado pelo usuário
  no celular (`location_consent_version = 2`) — persistência ok. O que o
  usuário viu depois do bloqueio de tela foi a permissão de GPS do
  próprio Android/Chrome (camada técnica, separada do termo LGPD do ATOS)

### Configuração dos campos do carimbo — Incremento 3 (2026-09-23)
- Migration 023 (ver seção 6). Padrões e rótulos em
  `src/lib/carimboConfig.ts`; banco guarda só as diferenças
- Campos: logo, nome da empresa, hora, data, dia da semana, endereço,
  coordenadas (padrão ligados, exceto nome da empresa) + número da OS,
  unidade, técnico que tirou a foto (padrão desligados). Selo ATOS fixo,
  não configurável (decisão de produto)
- `desenharCarimbo()` respeita a config; contexto (OS/unidade) só é
  buscado no banco se ligado; **endereço desligado = coordenada nem é
  enviada ao OpenStreetMap** (ganho de privacidade)
- `CarimboConfigCard` em Configurações: switches + prévia ao vivo
  (retrato/paisagem) desenhada pela MESMA função do upload real +
  "Restaurar padrão"
- **Correção de registro**: a OS usada nos testes de evidência
  (`596ae00c…`) é a **OS-0010 real do usuário**, não uma OS de teste
  como foi dito ao usuário — fotos de teste foram parar nela. Testes
  seguintes passam a usar a OS "Teste camera embutida (checklist)"
  (`7bec79dd…`)
- Ajustes achados na prévia: subtítulo "Gestão de Campo" passou de
  cinza para branco+sombra (sumia em fundo claro); "Téc." e o nome
  unidos por espaço não-separável (quebra de linha os separava)
- Testado ponta a ponta: (1) admin liga/desliga campos, prévia muda ao
  vivo (retrato/paisagem), persiste após reload e no banco
  (`stamp_config` só com as diferenças); (2) segurança da função via
  impersonação SQL: técnico → "Sem permissão"; admin com chaves
  inválidas (`plan`, `status`, `numero_os:"sim"`) → só a válida
  gravaria (teste em transação com rollback); (3) foto real do técnico
  na OS-0018 de teste: sai com nº da OS, unidade, técnico, sem dia da
  semana, conforme a config; OS sem unidade omite o campo sem erro.
  Para validar a unidade, a OS-0018 (de teste) recebeu a unidade
  principal do "Cliente Trigger Teste"
- Config do tenant Infoxtec devolvida ao padrão (`{}`) ao fim dos testes

### 🔴 Auditoria de armazenamento das fotos (2026-09-23, pedido do usuário)
Contexto: Supabase free (1 GB de storage); usuário quer o método que
ocupe menos espaço também no plano pago. Ambiente DEV = HML, sem dados
reais (confirmado pelo usuário — fotos de teste na OS-0010 não precisam
ser limpas por esse motivo).
- **Como está hoje**: banco guarda só o caminho do arquivo (texto,
  ~100 bytes/linha — banco inteiro 13 MB); a foto fica no bucket privado
  `evidencias` como JPEG qualidade 0.8, **só a versão carimbada**.
  Assinatura PNG (~20 KB), logo PNG 400px (~56 KB, uma por tenant).
  Bucket hoje: 31 arquivos, 5,3 MB
- **Achado 1 — limite de tamanho só na largura**: `LARGURA_MAX = 1600`
  limita a largura; foto retrato sai 1600×2845 (4,5 MP) enquanto
  paisagem sai 1600×900 (1,4 MP) — retrato ocupa ~3× mais sem ganho
  real. Maior foto real do bucket: 875 KB
- **Achado 2 — arquivos órfãos (vazamento de espaço)**: 8 arquivos sem
  nenhum registro apontando pra eles (3 de OS, 5 de checklist). Causas:
  (a) foto do checklist sobe na hora, mas o caminho só é gravado quando
  o técnico toca em "Salvar" — saiu sem salvar, o arquivo fica perdido
  (também perde a foto do ponto de vista do técnico); (b) exclusão de
  instância de checklist/registro não remove o arquivo do bucket
- **Achado 3 — tráfego (egress)**: miniaturas das listas baixam a foto
  inteira; cada abertura de OS com fotos consome a foto cheia de cada uma
- Proposta levada ao usuário (aguardando decisão): limite no MAIOR
  lado, miniatura separada para listas, auto-salvar a foto do
  checklist, rotina de limpeza de órfãos; WebP e política de retenção
  por plano como opções

### Otimização de armazenamento — A, B, C (2026-09-23, aprovados pelo usuário)
- **A — limite no maior lado**: `LADO_MAX = 1600` vale para o maior
  lado. As dimensões são lidas do cabeçalho JPEG (marcador SOF +
  orientação EXIF, `dimensoesJpeg()`), sem decodificar, e o navegador
  decodifica direto no tamanho final. **Achado junto**: a foto retrato
  real do usuário (1600×2845) tinha sido AMPLIADA — o quadro da câmera
  embutida é 1080×1920 e o código antigo forçava largura 1600. Agora
  nunca amplia (retrato de câmera 1080×1920 → 900×1600)
- **B — miniatura**: cada foto gera também `<nome>_mini.jpg` (maior lado
  400 px, qualidade 0.7), feita do canvas já carimbado, sem coluna nova
  no banco (nome derivado). Listas/cards usam a miniatura
  (`urlMiniaturaEvidencia`, cai para a foto cheia em fotos antigas sem
  miniatura); a foto cheia só é baixada no visualizador/download.
  Remoção apaga as duas. Falha ao subir a miniatura não invalida a
  evidência
- **C — foto do checklist salva na hora**: `ChecklistFillList` ganhou
  `onFotoAlterada`; campo do tipo foto grava o item assim que a foto
  sobe ou é removida (OS e checklist avulso). Fim da foto perdida/órfã
  por sair sem "Salvar"
- **D (limpeza de órfãos)**: em vez de rotina escondida, usuário pediu
  opção em Configurações (limpeza + exportação ZIP) — em discussão
- **Decisão de plano Supabase adiada (pedido do usuário)**: estimativa
  ~300 KB/foto → 1 GB ≈ 3.300 fotos; Infoxtec com ~300 OS/mês × 10 fotos
  enche o free em ~1 mês mesmo otimizado. No pago, espaço é barato;
  cuidado maior é egress. **Reavaliar antes da promoção para PRD**
- Testado ponta a ponta (URL pública, técnico real, OS-0018 de teste):
  foto 4032×3024 com EXIF orientação 6 → salva em retrato **1200×1600,
  168 KB** (+ miniatura 16 KB); quadro 1080×1920 → **129 KB** (+ 13 KB);
  foto do checklist pela câmera embutida → 56 KB (+ 7 KB). Referência
  antes da mudança: foto retrato real de 875 KB (≈ **80% menor** agora).
  Cards usam `_mini.jpg`, visualizador usa a foto cheia. Checklist:
  foto anexada e modal fechado SEM "Salvar" → resposta gravada no banco

### Espaço usado + fim dos órfãos (2026-09-23)
**Decisões do usuário**: exportação ZIP como módulo em Configurações;
período de limpeza escolhido pelo cliente; "não deveríamos ter fotos
órfãs"; admin vê total + por técnico, super admin vê por tenant e os
técnicos de cada tenant; ordem técnica delegada → espaço+órfãos →
exportação ZIP → código de verificação → "liberar espaço"
- Migration 024 (ver seção 6): detecção de órfãos e uso por
  tenant/usuário (autor = `storage.objects.owner`)
- **Achado na auditoria**: 4 pontos excluíam registro sem apagar
  arquivo — excluir OS (fotos, assinatura e fotos dos checklists da OS),
  excluir checklist avulso, desassociar checklist da OS e trocar o
  checklist ao editar a OS. Confirmado no banco: assinatura órfã de uma
  OS já excluída. Todos passam a apagar a pasta correspondente
  (`src/lib/armazenamento.ts`). Também: se o registro da evidência
  falhar depois do upload, o arquivo é apagado na hora
- **Rede de segurança automática**, sem botão (órfão é falha do sistema,
  não decisão do admin): ao usar o painel, admin/super admin disparam
  uma varredura no máx. a cada 12h que remove arquivos sem referência há
  mais de 1h (margem protege upload em andamento)
- `ArmazenamentoCard` no topo de Configurações: total + fotos; admin vê
  por usuário que enviou; super admin vê todas as empresas (expansíveis
  até os técnicos) + barra do limite de 1 GB do projeto
- Testado ponta a ponta (URL pública + banco): (1) login do admin
  disparou a varredura → **9 órfãos removidos (745 KB)**, bucket 37 → 28
  arquivos, `arquivos_orfaos()` passa a retornar 0; segunda navegação
  não varre de novo (intervalo 12h); (2) card mostra 5,0 MB / 23 fotos
  com divisão por usuário; (3) `uso_armazenamento()` como super admin
  lista todos os tenants e usuários; como técnico → "Sem permissão";
  (4) admin removeu o checklist da OS-0018 de teste → foto e miniatura
  da pasta dele apagadas do bucket na hora

### Configurações com seções recolhíveis + limpeza visível (2026-09-23)
- **Feedback do usuário**: (1) "não tenho a opção de limpeza" — a
  limpeza de órfãos existe mas é automática e ficou invisível; o
  "liberar espaço" (período escolhido pelo cliente) ainda não foi
  construído — explicação anterior misturou os dois; (2) seções como o
  Carimbo deveriam ficar recolhidas
- `SecaoRecolhivel` (src/components/ui/secao-recolhivel.tsx): seção abre
  FECHADA, cabeçalho com resumo (Armazenamento: total + fotos; Carimbo:
  Padrão/Personalizado; Marca: miniatura da logo), estado lembrado por
  navegador. Aplicada em Armazenamento, Marca da empresa e Carimbo;
  exportação e liberar espaço vão usar o mesmo padrão
- Card Armazenamento ganhou o aviso "Limpeza automática de arquivos sem
  uso: ativa" + última verificação e resultado; abrir a tela também
  verifica/remove órfãos (+1h) antes de medir
- Testado (URL pública, admin real): as 3 seções abrem fechadas com
  resumo no cabeçalho (4,9 MB · 22 fotos / logo / Padrão); abrir mostra
  o conteúdo; estado lembrado após recarregar; aviso de limpeza com
  "Última verificação: 23/09, 18:49 — nada a remover"; zero erros
- **Bug achado pelo usuário**: ao expandir o Carimbo a prévia vinha
  vazia até mexer num campo — o canvas só monta com a seção aberta e o
  desenho (useEffect com useRef) já tinha rodado antes, sem canvas.
  Corrigido com ref por estado (callback ref) nas dependências do desenho
  — testado na URL pública: seção fechada → expandir → prévia já
  desenhada, sem tocar em campo

### Exportação de fotos em ZIP (2026-09-23)
- Seção recolhível "Exportar fotos" em Configurações (admin): período
  (De/Até, padrão últimos 30 dias, pela data da foto) + cliente opcional
  (Combobox). Duas etapas: "Verificar fotos do período" (só lista e
  conta, sem baixar) → "Baixar ZIP (N arquivos)" com progresso
- Botão "Baixar fotos (ZIP)" no card de evidências do detalhe da OS
  (admin) — mesma lib, filtrado pela OS
- `src/lib/exportacaoFotos.ts` + lib `client-zip` (MIT, ~40 KB, sem
  dependências): ZIP montado NO NAVEGADOR — **nenhum arquivo temporário
  no servidor**, por isso a regra "apagar após download ou em 10 min"
  proposta pelo usuário não é necessária (não há o que apagar); também
  evita limite de memória/tempo de Edge Function
- Conteúdo: evidências da OS, fotos de checklist (OS e avulsos, pasta
  "Checklists avulsos/"), assinaturas. Pastas `OS-0012 - Cliente -
  Unidade/`, arquivos `AAAA-MM-DD_HHMM_evidencia.jpg`,
  `..._checklist_<item>.jpg`, `assinatura_<nome>.png`; planilha
  `fotos.csv` (";" + BOM, abre no Excel pt-BR) com OS, cliente, unidade,
  item do checklist, autor, data/hora, observação e situação (arquivo
  não encontrado fica marcado, o ZIP não falha)
- Egress: a exportação baixa as fotos cheias (é o objetivo); URLs
  assinadas de 10 min, 4 downloads em paralelo
- Testado ponta a ponta (URL pública, admin real, ZIP aberto e
  validado): período 30 dias → 23 arquivos em 3 pastas (22 evidências +
  1 assinatura = exatamente o que há no banco), integridade do ZIP ok,
  0 imagens inválidas, `fotos.csv` com 23 linhas; ZIP por OS (OS-0010: 12
  arquivos; OS-0018: evidências + foto do checklist com o nome do item)
- **Achado 1 (corrigido)**: 11 erros 400 no console ao abrir OS com
  fotos antigas (sem miniatura) — `createSignedUrl` da miniatura
  inexistente. Trocado por `createSignedUrls` (lote), que devolve "não
  existe" por item sem erro HTTP → 0 erros, 11 imagens carregadas
- **Achado 2 — bug antigo de rastreabilidade (F5), corrigido**: nenhuma
  resposta de checklist gravava o autor (`answered_by` 0 de 3) e a hora
  não era atualizada ao corrigir uma resposta. Migration 025 (gatilho no
  banco, cobre qualquer origem). Respostas antigas seguem sem autor
  — testado: técnico real trocou a foto de um item pela câmera embutida
  e fechou sem "Salvar" → resposta gravada com autor "Infoxtec Teste" e
  hora atual; no bucket ficaram só a foto nova + miniatura (a anterior
  foi apagada, sem órfão)

### Código de verificação de autenticidade (2026-09-23)
- Decisão de produto (VISAO_ATOS.md F6): marca ATOS = selo "ATOS
  Verificado · CÓDIGO", entra no MVP antes do PDF
- **Código**: 12 caracteres sem ambíguos (sem I, L, O, 0, 1), 31^12 ≈
  7,9×10^17, gerado com `crypto.getRandomValues` (sem viés de módulo),
  exibido K7P2-9XQ4-M3TD. Impresso no selo do canto superior direito +
  endereço do site de verificação (host atual, então vale em DEV e PRD)
- **Na foto**: código → carimbo → SHA-256 do JPEG final → upload →
  registro em `fotos_verificacao` (migration 026). Se o registro falhar,
  a foto é apagada e o técnico tenta de novo (o código é parte da prova)
- **Banco à prova de forja**: gatilho define tenant, autor (auth.uid())
  e `enviado_em = now()` do servidor — cliente não escolhe; arquivo fora
  da pasta da empresa é recusado; sem UPDATE/DELETE (imutável). Testado
  por impersonação: hora "2020-01-01" enviada → gravada a do servidor;
  pasta de outro tenant → erro; tentativa de trocar hash → inalterado
- **Edge Function `verificar-foto`** (pública, verify_jwt=false,
  publicada via Management API, versionada em supabase/functions/):
  recalcula o SHA-256 do arquivo GUARDADO e compara com o registrado
  (detecta troca do arquivo depois do envio); devolve só empresa, nº da
  OS, hora da foto (aparelho), hora do servidor, divergência de relógio,
  resultado e URL temporária (5 min) da foto — nenhum id, e-mail ou nome
  de técnico (LGPD)
- **Página pública `/verificar` e `/verificar/:codigo`**: resultado
  (autêntica / alterada / não encontrada / arquivo removido), dados,
  alerta se o relógio do aparelho diverge +10 min do servidor, a foto, e
  "Conferir arquivo" (hash calculado no navegador de quem verifica —
  avisa que apps de mensagem recomprimem imagens). Limite honesto
  escrito na página: garante inalteração + hora do servidor; GPS vem do
  aparelho
- Visualizador de evidência mostra "Verificado · CÓDIGO" com link;
  planilha do ZIP ganhou "Código de verificação" e "Verificar em";
  prévia do carimbo mostra código de exemplo; aviso de privacidade
  explica o código (sem novo aceite: não muda o tratamento de
  localização)
- Fotos anteriores ao recurso não têm código (continuam válidas)
- Testado ponta a ponta (URL pública): técnico real enviou foto na
  OS-0018 → código Z44G-3JH3-K7S6 impresso no selo, registro com autor
  "Infoxtec Teste", 1 s entre hora da foto e do servidor; página pública
  sem login (código digitado com hífens/minúsculas) → "Foto autêntica"
  com empresa, OS, horários e a foto; cópia idêntica → "Idêntica";
  outro arquivo → "Diferente"; código inexistente → "não encontrado";
  0 erros de console; visualizador mostra "Verificado · código" com
  link; planilha do ZIP traz código e link de verificação
- **Achado testando — brecha fechada (migration 027)**: o admin
  conseguia sobrescrever uma foto de evidência já enviada (policy de
  UPDATE do storage valia para tudo). A verificação detectou ("Foto
  alterada" → restaurado → "autêntica"), mas agora a sobrescrita é
  bloqueada (403) para fotos; logo e assinatura continuam regraváveis
  (regressão da migration 021 testada)

### 🔴→✅ Aba antiga rodando versão velha do app (2026-09-23, achado pelo usuário)
- **Relato**: no celular, o link "Verificado · código" apareceu na
  primeira foto; ao voltar da página de verificação sumiu, e uma foto
  nova também saiu sem ele
- **Diagnóstico (banco + arquivos)**: a foto das 00:45 tem código,
  900×1600 e miniatura; a das 00:49 saiu **1600×2845, sem miniatura e
  sem código** — assinatura exata da versão de ANTES das melhorias do
  dia. Ou seja, o usuário voltou para uma aba aberta antes dos deploys:
  app de página única roda o código de quando foi carregado até
  recarregar. Risco real no campo (técnico deixa o app aberto por dias)
- **Correção**: `vite.config.ts` gera `version.json` com o id do build
  (SHA do commit na Vercel) e embute o mesmo id no app (`__BUILD_ID__`);
  `AtualizacaoApp` checa ao voltar para a aba, ao focar e a cada 5 min;
  havendo versão nova mostra a faixa "Nova versão do ATOS disponível —
  Atualizar" e recarrega sozinho na PRÓXIMA troca de tela (nunca no meio
  de checklist/formulário, pra não perder o que foi digitado).
  `vercel.json`: `version.json` com no-store e index com no-cache
- Testado (URL pública, técnico real, versão nova simulada
  interceptando `version.json`): mesma versão → sem faixa; versão nova →
  faixa aparece ao focar; próxima troca de tela → recarregou sozinho em
  /campo/checklists e a faixa sumiu. `version.json` publicado com o SHA
  do commit (adf9f3d36dc0) e `Cache-Control: no-store`
- Limitação: abas abertas ANTES deste deploy ainda não têm o verificador
  — precisam ser recarregadas uma última vez manualmente
- **Nome do selo/link**: usuário achou "Verificado · código" pouco
  estético/intuitivo e pediu 5 opções — aguardando escolha

### 🔴→✅ Selo some ao voltar da página de verificação (2026-09-23, celular real)
- **Relato**: tocar em "Verificado · código" abria nova janela; ao
  voltar, o visualizador tinha fechado e, reabrindo a foto, o selo não
  aparecia até recarregar a página
- **Diagnóstico**: não reproduz no Chromium desktop (3 cenários: nova
  aba, recarga, voltar) — é comportamento do Android ao trocar de
  janela: Radix fecha o Dialog por "foco fora" e a busca do código não
  era refeita nem retentada em caso de falha momentânea
- **Correção (elimina a causa em vez de remendar)**: o app não abre mais
  janela. O selo abre um **painel dentro do visualizador** com o
  resultado (autêntica/alterada + hora do servidor), **"Compartilhar
  link"** (share nativo do celular — WhatsApp, e-mail; sem share, copia
  o link) e "Abrir página pública" como secundário. Visualizador não
  fecha mais por troca de janela (`onFocusOutside`/`onInteractOutside`).
  Código buscado com até 3 tentativas e de novo ao voltar para o app;
  `codigoDaFoto` distingue falha (tenta de novo) de "sem código".
  Consulta pública (`src/lib/verificacao.ts`) via fetch com chave
  pública — não depende da sessão do usuário (usada também pela página
  /verificar)
- Testado (URL pública, técnico real, perfil Pixel 5): selo → painel
  "Foto autêntica — idêntica à enviada. Recebida pelo servidor em
  23/09/2026, 21:44" (foto real FXN7-S46J-U2KF do usuário); nenhuma aba
  aberta; "Compartilhar link" → link copiado
  (…/verificar/FXN7S46JU2KF); sair e voltar ao app (visibilitychange +
  blur/focus) → visualizador continua aberto com o selo; reabrir → selo
  aparece; 0 erros. Ajuste visual junto: fundo do visualizador passou a
  preto sólido (a tela de trás aparecia por transparência)

### Feedback de UX em teste real (2026-09-24) — aguardando decisão
- Verificação dentro do visualizador validada pelo usuário no celular
  (código HACK-8BT7-VP6E, "Foto autêntica")
- **Faixa "Nova versão — Atualizar" considerada péssima para a UX**
  (apareceu ao voltar ao app, com a foto já fechada). Proposta levada ao
  usuário: atualização SILENCIOSA (sem faixa) feita com o app em segundo
  plano e sem trabalho pendente, + estado da tela na URL (foto aberta)
  para reabrir exatamente onde estava — inclusive quando o Android
  descarta a aba por memória (causa provável da foto fechada)
- **Selo na foto**: nome ainda NÃO foi trocado (aguardava escolha).
  Usuário questionou se o selo é configurável e se precisa da URL.
  Proposta: selo fixo (confiança = padrão único), "Foto autenticada ·
  CÓDIGO" + QR Code no lugar da URL em texto
  → **Aprovado pelo usuário ("ok pode seguir") e implementado em
  2026-09-24:**
  - **Atualização silenciosa** (`AtualizacaoApp` sem faixa): versão nova
    é aplicada recarregando o app ESCONDIDO quando ele vai para segundo
    plano, ou na próxima troca de tela — só se `haTrabalhoPendente()`
    (src/lib/trabalhoPendente.ts) disser que nada se perde: sem upload
    em andamento, sem checklist com respostas não salvas, sem janela/
    modal aberto (formulário, câmera, checklist) e sem campo de texto
    digitado em foco. Visualizador de foto é marcado como seguro
  - **Foto aberta na URL** (`useFotoAberta`, `?foto=caminho`): recarga
    (atualização ou Android descartando a aba) reabre a mesma foto; o
    "voltar" do celular fecha a foto em vez de sair da OS
  - **Selo fixo "Foto autenticada · CÓDIGO" + QR Code** (lib
    `qrcode-generator`, MIT, sem dependências) com o link direto da
    verificação daquela foto, no lugar da URL em texto; botão do app e
    textos da página /verificar, prévia do carimbo e aviso de
    privacidade atualizados
- `npm audit` acusa 4 vulnerabilidades (2 moderadas, 2 altas)
  PRÉ-EXISTENTES, em ferramentas de build (esbuild, browserslist,
  js-yaml, brace-expansion) — nenhuma do pacote novo. Registrado para a
  F10 (OWASP); não corrigido agora (`npm audit fix` pode subir a versão
  do Vite no meio da F6)
- Testado ponta a ponta (URL pública, técnico real, câmera embutida):
  botão do app "Foto autenticada · EQKS-YA83-PAKG"; **QR Code da foto
  salva decodificado (jsQR) = https://atosdev.vercel.app/verificar/
  EQKSYA83PAKG**; foto aberta vai para a URL (`?foto=…`), recarga reabre
  a mesma foto, "voltar" fecha a foto e mantém na OS; versão nova +
  câmera aberta + app em 2º plano → NÃO recarrega; câmera fechada + 2º
  plano → recarregou em silêncio na mesma OS; nenhuma faixa exibida.
  Um 401 isolado no console apareceu uma vez e não se repetiu em 3
  execuções seguidas (provável requisição interrompida pela recarga) —
  acompanhar
- **Validado pelo usuário no celular real em 2026-09-24** ("tudo
  funcionando"): QR do selo, foto preservada ao bloquear/voltar,
  "voltar" fechando a foto

### Assinaturas no encerramento da OS (2026-09-24, 4 decisões do usuário)
- **Pedido**: assinatura do cliente no modal de encerramento (não no
  corpo da OS); OS só fecha com assinatura salva; botão Limpar; e
  tratar assinatura do técnico. Aprovadas as 4 recomendações + Limpar
- **Estado anterior levantado**: assinatura do cliente no corpo da OS
  com "Salvar" separado; técnico sem assinatura; bloqueio existia mas a
  Infoxtec estava com a opção DESLIGADA (por isso fechou sem); Limpar
  existia como botão "fantasma" quase invisível
- **Modal único `ConcluirOSModal`** (técnico e admin): relato, data/hora,
  assinatura do cliente (nome + quadro) e do responsável; "Concluir"
  grava assinatura + conclusão juntas — não existe mais assinatura
  desenhada e não salva. Se a OS já tem assinatura (reaberta), mostra só
  leitura
- **Obrigatoriedade**: continua configurável, padrão agora "exigir" e
  Infoxtec ligada. **Regra também no banco** (gatilho da migration 028):
  vale para qualquer tela/origem
- **"Cliente não pôde assinar"** com motivo obrigatório, só se a empresa
  ligar "Permitir concluir sem assinatura do cliente, com motivo" em
  Configurações (padrão desligado). Evento `signature_absent` na linha
  do tempo; corpo da OS mostra o motivo em destaque
- **Assinatura do responsável**: desenhada uma vez ("Minha assinatura" —
  ícone de caneta no cabeçalho do app de campo e no menu lateral; ou no
  próprio modal na primeira conclusão) e COPIADA para a OS
  (`{os}_responsavel.png`) — trocar depois não altera OS concluídas
- **`QuadroAssinatura`** reaproveitável: "Limpar" visível (contorno),
  habilitado só com traço; dica "Assine aqui com o dedo"
- Corpo da OS (técnico e admin) mostra as assinaturas só para leitura
  (`AssinaturasDaOS`); componente antigo `OrderSignature` removido
- **Achado testando (corrigido)**: um toque FORA do modal de
  encerramento o fechava e descartava relato + assinaturas desenhadas
  (no celular, toque sem querer na borda enquanto o cliente assina).
  `Modal` ganhou `fecharAoClicarFora`; o de encerramento só fecha por
  Cancelar/X
- Testado ponta a ponta (URL pública + banco): regra do banco por
  impersonação (sem assinatura → bloqueia; exceção não permitida →
  bloqueia; permitida → conclui). Técnico real: 1ª conclusão (OS-0019)
  pediu e salvou a assinatura do responsável no perfil + cópia na OS;
  OS-0021: toque fora não fecha o modal, "Concluir" sem assinar → erro,
  Limpar desabilitado/habilitado/desabilitado conforme o traço, assinou
  sem nome → erro, conclusão ok com cliente "Maria Cliente Teste" e
  responsável aplicado do perfil, 2 assinaturas no corpo da OS; admin
  ligou a exceção em Configurações → OS-0020 concluída com "Cliente não
  pôde assinar" (motivo obrigatório testado), evento
  `signature_absent` na linha do tempo, motivo em destaque no corpo;
  "Minha assinatura" exibe e permite refazer; admin abre o MESMO modal
  no painel (pede a assinatura dele na 1ª vez), Cancelar fecha; exceção
  devolvida ao padrão (desligada); `arquivos_orfaos` não marca as
  assinaturas novas. OS de teste criadas: OS-0019, OS-0020, OS-0021
- **Validado pelo usuário no celular real em 2026-09-24** ("validado,
  ficou ótimo")
- Sem migration

### Próximos blocos
> **Atualização 2026-09-24:** C, D (Básico/Intermediário) e E foram
> construídos — ver as seções "Bloco C", "Blocos D + E" mais abaixo
> neste documento. Texto original mantido para histórico:
- **C** — Geração do PDF (dados da OS + checklist + evidências + assinatura) — ✅ feito
- **D** — Envio (WhatsApp/e-mail) — **pendente de detalhamento técnico**:
  painel multi-tenant com QR Code para conectar instância Evolution
  própria de cada cliente (ver nota em `VISAO_ATOS.md`, seção F6) — ✅
  Básico/Intermediário feitos; Avançado (Evolution) pendente
- **E** — Painel do gestor (disparo manual) + controle admin de bloqueio — ✅ feito (permissões em Configurações → Envio do relatório; gestor/admin sempre podem enviar pela OS)

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
| 023_f6_carimbo_config | tenants.stamp_config (jsonb, só diferenças do padrão) + função atualizar_carimbo_tenant() (SECURITY DEFINER, admin, só chaves conhecidas booleanas) | OK | Pendente | Sim |
| 024_f6_armazenamento | funções arquivos_orfaos() e uso_armazenamento() (SECURITY DEFINER, admin/super_admin, só consulta — remoção via Storage API) | OK | Pendente | Sim |
| 025_f5_checklist_answer_autor | gatilho fn_checklist_answer_autor(): grava answered_by (auth.uid()) e answered_at em todo INSERT e em UPDATE que muda o valor — corrige autoria nunca registrada | OK | Pendente | Sim |
| 026_f6_verificacao_fotos | tabela fotos_verificacao (código, sha256, hora do servidor, autor; imutável, sem UPDATE/DELETE) + gatilho que força tenant/autor/hora e bloqueia arquivo de outra empresa | OK | Pendente | Sim |
| 027_f6_evidencias_imutaveis | policy evidencias_update restrita a logo.png e assinaturas/ — fotos de evidência não podem mais ser sobrescritas | OK | Pendente | Sim |
| 028_f6_assinatura_no_encerramento | tenants.allow_signature_exception + padrão "exigir assinatura" (Infoxtec ligada); orders.signature_absent_reason e technician_signature_path/signer_name/signed_at; atualizar_config_tenant com parâmetros opcionais; gatilho que barra conclusão sem assinatura exigida; arquivos_orfaos reconhece as novas assinaturas | OK | Pendente | Sim |
| 029_f6_geocodificacao_plataforma | geocodificacao_config (provedor + chave, 1 linha), geocodificacao_cache (região ~55 m) e geocodificacao_uso (dia × empresa × provedor), todas sem leitura direta; funções definir_config_geocodificacao / status_geocodificacao (Super Admin), provedor_geocodificacao (qualquer logado), uso_geocodificacao (admin: própria empresa; super admin: todas), registrar_uso_geocodificacao (só service role) | OK | Pendente | Sim |
| 030_f6_relatorio_pdf | order_reports (versões, status pendente/gerando/gerado/falha) + RLS leitura por empresa; fotos_verificacao.tipo (foto/relatorio) e gatilho aceita service role; pg_net; gatilho em orders: concluída → relatório pendente + chamada à Edge Function (chave no Vault); bucket 25 MB; arquivos_orfaos reconhece PDFs | OK | Pendente | Sim |
| 031_f6_dados_empresa | tenants.trade_name (nome de exibição) e website; cnpj_valido() (dígitos verificadores); atualizar_dados_empresa() (admin: nome de exibição, CNPJ, telefone, e-mail, site — razão social continua do Super Admin) | OK | Pendente | Sim |
| 032_f6_liberar_espaco | colunas arquivo_removido_em/removido_em (evidências, verificação, relatórios); liberacoes_espaco (histórico) + RLS; os_para_liberar, arquivos_para_liberar (nível 1 só OS com PDF guardado), previa_liberar_espaco, registrar_liberacao (admin, só pasta da empresa) | OK | Pendente | Sim |
| 033_f6_identidade_empresa | atualizar_dados_empresa sem CNPJ (admin: nome de exibição e contato); tenant_identidade_historico; atualizar_identidade_tenant() (só Super Admin: razão social + CNPJ validado, com histórico e fonte receita/manual) | OK | Pendente | Sim |
| 034_f6_envio_relatorio | tenants.envio_nivel (basico/intermediario/avancado); tenant_envio_config (canais, mensagem, permissão Bloco E, SMTP próprio sem senha) + gatilho de padrão; salvar_config_envio, definir_senha_smtp (Vault), tem_senha_smtp, ler_senha_smtp (só service role), definir_nivel_envio (Super Admin) | OK | Pendente | Sim |
| 035_calendarios | módulo Calendários: tenants.fuso_horario/sede_cidade_ibge/sede_cidade; feriados (plataforma/estadual/municipal IBGE/empresa; feriado/facultativo/reduzido com janela; anual) + feriados_efeito_empresa; horarios_atendimento nomeados (um padrão; "Comercial" criado para todas); locations.cidade_ibge/horario_funcionamento; funções feriados_do_dia, periodos_do_dia, eh_dia_util, proximo_dia_util, horas_uteis_entre, somar_horas_uteis, situacao_do_dia, unidade_aberta; nacionais 2025–2036 | OK | Pendente | Sim |
| 036_endereco_estruturado | locations.cep/logradouro/numero/complemento/bairro + gatilho que monta address e acerta UF pelo IBGE; cpf_valido, formatar_documento, gatilho de CPF/CNPJ do cliente (só quando muda); salvar_cliente (cliente + unidade principal numa transação, SECURITY INVOKER); definir_sede_tenant (Super Admin) | OK | Pendente | Sim |
| 037_unidade_documento | locations.documento (CPF ou CNPJ, opcional); normalizar_documento() — regra única de CPF/CNPJ usada pelos gatilhos de clients e locations (valida só quando muda) | OK | Pendente | Sim |
| 038_recorrencia_checklists | checklist_series + checklist_instances.serie_id/data_prevista/prazo; fn_regra_erro, datas_da_regra, datas_da_serie, previa_recorrencia, gerar_ocorrencias (só servidor), salvar_serie, definir_situacao_serie, alterar_ocorrencia, fn_hoje_empresa; pg_cron + job atos-gerar-ocorrencias (hora em hora) | OK | Pendente | Sim |
| 039_recorrencia_ajustes | fn_regra_norm; aviso_da_data (feriado/fim de semana + unidade fechada); previa_recorrencia usa o aviso; salvar_serie mantém o início (ritmo) quando a regra não muda | OK | Pendente | Sim |

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
- [x] Campo "nome fantasia/exibição" no tenant (nome longo cortado na sidebar) — **feito em 2026-09-24** (migration 031, `trade_name`, editável pelo admin)
- [ ] Ajuste de contraste do ícone ATOS na sidebar
- [ ] **Responsividade do painel admin (acabamento pré-PRD, após F5-F7):** — *parcial em 2026-09-25: página não fica mais larga que a tela no celular (`min-w-0` no `<main>`); o resto segue pendente. Esclarecido ao usuário: responsividade do painel NÃO está garantida — o foco mobile garantido é o app do técnico; painel admin é uso principal em desktop até este item ser feito* — sidebar → menu hambúrguer; listagens no mobile com LISTA COMPACTA como padrão (não cards) + busca/filtros fortes, toggle para cards opcional; revisar modais. Aplicar em OS, Clientes, Unidades, Técnicos e Checklists
- [ ] Aba "auditoria/histórico completo" da OS (mostrar também os eventos 'edited' ocultos da linha do tempo)
- [ ] Auto-atribuição: técnico pegar OS do backlog (Aberta sem técnico) — F4+
- [ ] Mapa visual embutido na tela do técnico (hoje só botão "Abrir no mapa")
- [ ] **Painel (dashboard) do Super Admin** — incluir a melhoria de UX do consumo de endereços (hoje texto corrido em Configurações → "Plataforma — endereço no carimbo"): gráficos por dia/empresa, destaque do limite diário, histórico mensal; junto com armazenamento por empresa. Pedido do usuário em 2026-09-24, adiado para não travar o Bloco C

---

*Última atualização: F5 CONCLUÍDA (checklists dinâmicos completos — modelos, preenchimento vinculado à OS, rastreabilidade de respostas, evidências fotográficas, e checklist avulso sem OS com vínculo opcional a cliente/unidade e atribuição a múltiplos técnicos). Testado ponta a ponta na URL pública. DECISÃO: completar MVP (F6-F7) antes de subir para PRD.*

*2026-09-22: F6 Bloco A (assinatura digital) CONCLUÍDO e testado ponta a ponta — ver seção 4.3, incluindo extensão de assinatura obrigatória configurável por OS.*

*2026-09-22: F6 Bloco B (carimbo de evidências + LGPD) CONCLUÍDO e testado ponta a ponta — ver seção 4.3. Logo de teste (placeholder) ficou configurada em Configurações — trocar pela logo real da Infoxtec quando quiser.*

*2026-09-22: evidências fotográficas passam a existir direto na OS, independentes de checklist (achado reportado pelo usuário na OS-0010 real) — ver seção 4.3. Também corrigida policy de UPDATE faltante no bucket `evidencias` (afetava "Trocar logo"). Próximo: Bloco C (PDF).*

*2026-09-22: migrations 004–016 reconstruídas/adicionadas e versionadas em `supabase/migrations/` (ver seção 6). Achados de segurança pendentes (token de acesso do Supabase usado nessas migrations, e Personal Access Token do GitHub embutido no remote git da pasta `C:\vluma\atosdev`) — revogar/trocar ambos **ao final de todo o desenvolvimento do MVP**, não antes (decisão do time, para não gerar atrito de credencial a cada sessão de trabalho).*

*2026-09-23: sessão encerrada com um bug aberto — ver "🔴 BUG ABERTO" na seção 4.3. Diagnosticado (falha no handoff câmera nativa→navegador em aparelhos com pouca RAM, não é algo que otimização de JS no app resolve), correção proposta (câmera embutida via getUserMedia) ainda NÃO implementada — depende de confirmação do usuário por ser mudança de UX, não ajuste pontual. **Esse é o item nº1 pra próxima sessão.***

*2026-09-23: bug de "falta de memória" — câmera embutida (`getUserMedia`) implementada nos dois pontos de captura de foto, substituindo o app de Câmera nativo; testada ponta a ponta na URL pública (4 cenários, incluindo um bug de modal achado e corrigido no próprio teste). Ver seção 4.3. Falta validação final no celular real do usuário — se confirmar, o bug fecha e o próximo passo é o Bloco C (PDF).*

*2026-09-23: validado no celular real — bug de memória FECHADO. Novo achado: carimbo escondido pela miniatura e desproporcional em foto retrato (seção 4.3); aguardando modelo do usuário antes do Bloco C.*

*2026-09-23: carimbo v2 no padrão do modelo do usuário + visualização em tela cheia e download de evidências (Incremento 1 de 3). Próximos: endereço via Edge Function/Nominatim (Inc. 2), configuração de campos do carimbo por tenant (Inc. 3). Em discussão com o usuário: marca ATOS removível ou não, e código de verificação de autenticidade.*

*2026-09-23: Incremento 3 (configuração dos campos do carimbo, migration 023) concluído e testado — ver seção 4.3. Próximo: Incremento 4 (código de verificação de autenticidade).*

*2026-09-23: Incremento 2 (endereço no carimbo) concluído e testado. Decisões de produto (marca ATOS como selo, código de verificação no MVP antes do PDF, ordem dos próximos passos) registradas em VISAO_ATOS.md, F6. Próximo: Incremento 3 (configuração dos campos do carimbo por tenant — tem migration).*

*2026-09-23: auditoria de armazenamento concluída — fotos ~80% menores (limite no maior lado, sem ampliar), miniatura para listas, foto do checklist salva na hora, espaço usado por tenant/técnico (migration 024) e zero órfãos (prevenção nas 4 exclusões + varredura automática). Próximo, ordem técnica definida: exportação ZIP em Configurações → código de verificação → "liberar espaço" (período escolhido pelo cliente).*

*2026-09-23: exportação de fotos em ZIP concluída e testada (Configurações + botão por OS, montado no navegador, sem arquivo temporário no servidor). Achados corrigidos no caminho: erros 400 de miniatura em fotos antigas e autoria de resposta de checklist nunca gravada (migration 025). Próximo: código de verificação de autenticidade.*

*2026-09-23: código de verificação de autenticidade concluído e testado (migrations 026–027, Edge Function verificar-foto, página pública /verificar). Fotos de evidência passam a ser imutáveis também no storage. Próximo: "liberar espaço" (período escolhido pelo cliente) e depois a discussão do provedor de geocodificação para SaaS, antes do Bloco C (PDF).*

*2026-09-24: UX da verificação fechada com o usuário — atualização silenciosa do app (sem faixa, só em momento seguro), foto aberta preservada na URL e selo fixo "Foto autenticada · CÓDIGO" com QR Code. Próximo: "liberar espaço" (período escolhido pelo cliente).*


*2026-09-24: assinaturas no encerramento da OS concluídas e testadas (migration 028): cliente no modal "Concluir atendimento", responsável desenhado uma vez no perfil, exceção com motivo configurável, regra no banco, Limpar visível e modal que não fecha por toque fora. Próximo: "liberar espaço".*

*2026-09-24: decisão — PDF gerado automaticamente NO SERVIDOR na conclusão da OS e guardado (relatório oficial, com código de verificação); "liberar espaço" em 2 níveis passa a depender dele. Nova ordem: geocodificação SaaS (discussão) → Bloco C (PDF) → liberar espaço. Detalhes em VISAO_ATOS.md, F6.*

### Geocodificação como serviço da plataforma (2026-09-24)
- **Decisões do usuário**: mesmo provedor em DEV e PRD; troca de provedor
  simplificada pelo Super Admin; ambiente preparado para dados de
  consumo geral e por empresa; custos registrados para a discussão de
  planos (VISAO_ATOS.md 7.1); ordem técnica delegada
- Análise de provedores (VISAO_ATOS.md F6): Google descartado (não
  permite guardar o endereço para sempre); OpenCage gratuito é só teste;
  **LocationIQ gratuito permite produção comercial** (5.000/dia, link
  "Search by LocationIQ.com", cache máx. 48 h) → recomendado. Até o
  usuário criar a conta/chave, a estrutura roda com Nominatim
- **Edge Function `geocodificar`** (verify_jwt=true): adaptadores
  Nominatim / LocationIQ / OpenCage → mesmo formato "Rua - Bairro,
  Cidade - UF, CEP"; cache compartilhado por região (~55 m) respeitando
  as horas configuradas; registra consulta/cache/falha por empresa e por
  dia; timeout 5 s; falha nunca bloqueia a foto. Modo "testar" (só Super
  Admin) consulta um endereço conhecido sem salvar
- **Tela do Super Admin** em Configurações ("Plataforma — endereço no
  carimbo"): provedor, chave (mascarada, nunca volta ao navegador), horas
  de cache, Testar, Salvar e ativar (vale na hora para todas as
  empresas); consumo de hoje (com limite diário gratuito do provedor) e
  do mês, geral e por empresa
- Chamada saiu do navegador (`src/lib/geocodificacao.ts` chama a função;
  sem cache local, para o consumo por empresa ficar exato)
- **Crédito do provedor** (`AtribuicaoMapas`): "Endereços: ©
  OpenStreetMap" (+ "Search by LocationIQ.com" quando for o LocationIQ)
  no rodapé do app de campo, no menu lateral e no aviso de privacidade
- **Termo de localização v3**: texto genérico ("provedor de mapas
  contratado pela plataforma, dados do OpenStreetMap") — trocar de
  provedor no futuro não exige novo aceite. Técnicos veem o termo
  atualizado uma vez
- **Achado testando — Nominatim público bloqueia servidores**: da Edge
  Function do Supabase o Nominatim responde HTTP 403 (bloqueio de IPs de
  nuvem), mesmo com User-Agent e Referer identificados. Do navegador
  funcionava; do servidor, não. Consequência: o LocationIQ (chave do
  usuário) passa a ser necessário já no DEV. Até a chave ser cadastrada
  pelo Super Admin, as fotos saem só com coordenadas (nunca bloqueia).
  A falha agora devolve o motivo técnico (ex.: "nominatim 403"), e a
  tela do Super Admin avisa
- Testado (URL pública + banco): coordenada inválida → 400; técnico no
  modo "testar" → 403; consumo registrado por empresa e por dia (3
  falhas contadas); `status_geocodificacao` e `uso_geocodificacao` ok
  como Super Admin; admin de empresa não troca provedor; LocationIQ sem
  chave → "Informe a chave da API"; rodapé mostra "Endereços: ©
  OpenStreetMap". Cache e endereço real serão testados com a chave do
  LocationIQ
- **LocationIQ ativado pelo usuário pela tela do Super Admin
  (2026-09-24)** — "Testar" retornou endereço de Salvador em 175 ms; tela
  validada na prática pelo usuário
- Ajustes após o print do usuário: (1) LocationIQ devolve o nome do
  estado ("Bahia") → função converte para a sigla (BA) em todos os
  provedores; (2) Super Admin não vê mais seções de EMPRESA em
  Configurações (Marca, Carimbo, Exportar, Assinatura) — não pertence a
  nenhuma; título da página vira "Configurações da plataforma ATOS"
- Testado com LocationIQ (técnico real): coordenada nova → "Rua
  Guindaste dos Padres - Comércio, Salvador - BA, 40020-210" (fonte
  provedor); mesma coordenada e ponto a ~20 m → fonte cache; consumo:
  locationiq 1 consulta + 2 cache; rodapé "Endereços: © OpenStreetMap ·
  Search by LocationIQ.com"

### Bloco C — Relatório PDF da OS (2026-09-24, layout aprovado)
- **Disparo pelo banco**: gatilho em `orders` (migration 030) — ao virar
  "concluida" cria o registro `order_reports` pendente e chama a Edge
  Function `gerar-relatorio-os` via pg_net. A chave de serviço usada na
  chamada fica no **Vault** (segredo `atos_service_role_key`, criado
  fora do git — no PRD precisa ser criado de novo). Não depende do
  celular do técnico
- **Edge Function `gerar-relatorio-os`** (pdf-lib + qrcode-generator,
  fontes padrão com acentos do português): cabeçalho com logo, empresa,
  CNPJ/contato, "RELATÓRIO DE ATENDIMENTO · OS-xxxx", QR + código
  "Documento autenticado"; 1. Dados (cliente, unidade, endereço,
  técnico, prioridade, situação, abertura/início/conclusão + duração);
  2. Serviço (solicitado + relato); linha do tempo (sem "edited");
  3. Checklist (item × resposta, foto → "nas evidências"); 4. Evidências
  em grade 2 por linha com legenda, observação e código de cada foto
  (fotos de checklist incluídas); 5. Assinaturas (cliente ou "CLIENTE
  NÃO ASSINOU — motivo" em destaque; responsável); rodapé com data de
  geração, link de verificação e "Página X de Y". Sem comentários
  internos. Título de seção nunca fica sozinho no pé da página
- Guardado em `{tenant}/relatorios/{os}_v{n}.pdf`; código + SHA-256 em
  `fotos_verificacao` (tipo relatorio); OS reaberta e concluída de novo
  = nova versão. Autorização: service role (papel lido do JWT já
  validado pela plataforma) ou usuário da mesma empresa
- **Achado**: comparar a chave de serviço com a variável de ambiente
  falhou (formatos diferentes) → autorização passou a ler o papel
  `service_role` do token validado
- **Tamanho**: as fotos entram como estão (JPEG ≤1600 px, ~130–170 KB);
  sem recompressão no servidor (Edge Function tem limite de CPU). PDF
  fica ~0,1 MB sem fotos e ~0,2 MB por foto — a estimativa anterior de
  0,6–0,9 MB vale para ~4 fotos. OS-0018 de teste (14 fotos, algumas
  antigas de 600 KB) = 3,6 MB / 5 páginas
- App: botão "Relatório (PDF)" na OS concluída (técnico e admin);
  "Gerando relatório…" enquanto o servidor trabalha; "Gerar relatório"
  como rede de segurança (OS antiga/falha). /verificar reconhece
  relatório ("Relatório autêntico", "Abrir o relatório (PDF)", conferir
  cópia em PDF). ZIP inclui o PDF de cada OS. Excluir OS apaga os PDFs
- Segredo `SITE_URL` = https://atosdev.vluma.com.br (link de verificação
  no PDF)
- Testado ponta a ponta (URL pública + banco): PDFs gerados para
  OS-0018 (checklist + 14 fotos, 5 págs), OS-0020 (cliente não assinou,
  caixa em destaque) e OS-0021 (2 assinaturas) — renderizados e
  conferidos visualmente (acentos ok). **Disparo automático**: técnico
  concluiu a OS-0022 pela tela → banco criou o registro e chamou a
  função via pg_net (HTTP 200) → PDF gerado em 3,5 s → botão passou de
  "Gerando relatório…" para "Relatório (PDF)" em ~6 s → download
  `Relatorio_OS-0022.pdf`; admin vê o mesmo botão; ZIP da OS contém
  `Relatorio_OS-0022.pdf` + assinatura + fotos.csv; /verificar com o
  código do PDF → "Relatório autêntico", botão "Abrir o relatório
  (PDF)" e "Conferir arquivo" com o PDF baixado → "Idêntica à
  original". 0 erros de console. OS de teste criada: OS-0022
- Observação: o PDF v1 da OS-0018 (teste) foi gerado antes do ajuste
  do título de seção sozinho no pé da página; relatórios novos já saem
  corrigidos
- **Feedback do usuário no PDF da OS-0018 (2026-09-24)**: (1) origem do
  CNPJ/e-mail no cabeçalho — vêm do cadastro do tenant (nome, cnpj,
  phone, email), preenchido pelo Super Admin na criação; e-mail hoje
  coincide com o login do admin. Proposta: admin editar "dados da
  empresa no relatório" em Configurações (aguardando decisão);
  (2) títulos "4. Evidências" e "5. Assinaturas" sozinhos no pé da
  página. O 1º já estava corrigido para relatórios novos; o 2º NÃO —
  a reserva do título (110) era menor que o bloco de assinaturas (120).
  Regra agora: a reserva do título = altura do 1º bloco que vem depois.
  Comprovado regenerando a OS-0018 (reabrir → concluir: v2 e v3 pelo
  gatilho do banco, versionamento ok): pág. 2 começa com "4. Evidências"
  + fotos e pág. 5 com "5. Assinaturas" + assinaturas

### Dados da empresa editáveis pelo admin (2026-09-24, aprovado pelo usuário)
- Configurações → "Marca e dados da empresa": logo + nome de exibição,
  CNPJ (máscara + validação dos dígitos verificadores na tela E no
  banco), telefone, e-mail de contato, site. Razão social só leitura
  para o admin (dado contratual, do Super Admin)
- Nome de exibição (`nomeEmpresa()`, cai para a razão social se vazio)
  usado no menu lateral (resolve nome longo cortado — item do backlog),
  painel, carimbo das fotos, prévia do carimbo, nome do ZIP, página
  /verificar e cabeçalho do PDF. No PDF, quando o nome de exibição é
  diferente, a razão social aparece na linha de contato (documento
  oficial); linha de contato quebra em até 2 linhas
- Testado (URL pública, admin real): CNPJ com dígito errado → "CNPJ
  inválido"; máscara aplicada; dados salvos no banco (CNPJ formatado);
  menu lateral passou de "Infoxtec Tecnologia e Serviços Ltda." para
  "Infoxtec"; PDF regenerado (OS-0022 v2/v3) com "Infoxtec" no título e
  razão social + CNPJ + telefone + e-mail + site na linha de contato.
  Achados no teste e corrigidos: linha de contato invadia o bloco
  "Documento autenticado" (largura livre errada) e o telefone quebrava
  no meio (cada dado agora fica inteiro). Dados de teste da Infoxtec
  (telefone/site/e-mail fictícios) desfeitos ao final — o admin deve
  preencher os dados reais

### "Liberar espaço" (2026-09-24, desenho aprovado pelo usuário)
- Configurações → "Liberar espaço" (admin): período pela data de
  conclusão/cancelamento da OS; **nível 1** (fotos + miniaturas,
  mantém o PDF — PDFs faltantes gerados antes pelo botão "Gerar
  relatórios que faltam") ou **nível 2** (fotos + PDFs — botão de apagar
  só libera depois de "Baixar ZIP do período", que usa exatamente as OS
  do período); "Calcular" mostra quantas fotos/PDFs/MB de quantas OS;
  confirmação digitando LIBERAR ESPAÇO; histórico (quando, quem,
  nível, período, arquivos, tamanho)
- **Achado no desenho (corrigido antes de liberar)**: OS cancelada não
  gera PDF — no nível 1 as fotos dela seriam apagadas sem registro.
  Nível 1 agora só mexe em OS com relatório PDF guardado; fotos de OS
  sem PDF só saem no nível 2 (que exige o ZIP)
- Nunca apaga: assinaturas, logo, dados da OS, linha do tempo, códigos
  de verificação. Remoção física pela Storage API; banco marca
  `arquivo_removido_em`/`removido_em`
- Depois de liberado: card da evidência mostra "Foto removida em dd/mm
  (está no relatório PDF da OS)"; foto de checklist idem; relatório
  removido (nível 2) mostra aviso; /verificar diz "a empresa removeu o
  arquivo do sistema em dd/mm" (o código continua válido e a cópia
  pode ser conferida); ZIP e exportação ignoram o que já foi removido
- Testado ponta a ponta (URL pública, admin real) numa OS isolada
  (OS-0023, conclusão ajustada para 15/01/2026 para não tocar outras):
  nível 1 → prévia "169 KB: 1 foto de 1 OS", botão só habilita com a
  frase, foto + miniatura apagadas, PDF mantido; nível 2 → prévia "1
  relatório PDF", confirmação só aparece depois do ZIP, PDF apagado;
  histórico com as 2 operações; OS mostra "Foto removida em…" e
  "Relatório removido em…"; /verificar da foto e do PDF: "a empresa
  removeu o arquivo do sistema em 24/09/2026"; 0 erros
- **Bug achado no teste (corrigido)**: o ZIP obrigatório do nível 2 saiu
  SÓ com fotos.csv — como o nível 1 já tinha apagado as fotos, a OS não
  aparecia nos itens e o PDF dela não entrava. Agora as OS pedidas
  entram sempre no ZIP com o PDF, mesmo sem nenhuma foto. (Na OS-0023 de
  teste o PDF foi apagado sem ir no ZIP — só dado de teste.)
- Reteste do cenário que falhou (OS-0024 isolada em 16/01/2026, nível 1
  → nível 2): ZIP obrigatório agora contém `Relatorio_OS-0024.pdf`; o
  SHA-256 do PDF dentro do ZIP é idêntico ao registrado na verificação —
  a cópia guardada pelo cliente continua conferível em /verificar mesmo
  depois de o arquivo ser apagado do sistema. OS de teste: OS-0023/0024

### Identidade legal da empresa — opção B + consulta à Receita (2026-09-24)
- **Pergunta do usuário**: o admin não pode alterar a razão social?
  Achado: inconsistência criada na migration 031 — CNPJ editável pelo
  admin e razão social não, sendo os dois a identidade legal. Opções
  levadas (A livre / B travado / C admin + Receita); **usuário escolheu
  B com o recurso de consulta à API pública**, a ser reusado na
  contratação SaaS (documentado no VISAO_ATOS.md, F8)
- Admin: razão social e CNPJ só leitura em "Marca e dados da empresa"
  ("para alterar, fale com o suporte VLUMA"); edita nome de exibição,
  telefone, e-mail, site (migration 033 tira o CNPJ da função)
- Super Admin: página **Empresas** (antes "Tenants", era só
  placeholder) → "Identidade legal": CNPJ com máscara/validação,
  **"Consultar na Receita"** (`src/lib/cnpj.ts`, BrasilAPI — gratuita,
  sem chave, CORS liberado) preenche a razão social (formatada da
  caixa-alta da Receita) e mostra situação cadastral (aviso se não
  ATIVA), município/UF e telefone; salvar grava histórico (anterior →
  novo, fonte "receita" ou "manual" se editada depois)
- Testado (URL pública): admin vê razão social + CNPJ só leitura com
  "fale com o suporte VLUMA", sem campo de CNPJ; salvar telefone
  funciona com a nova função (valor de teste desfeito depois); admin em
  /tenants é redirecionado (rota só Super Admin). Banco: admin →
  "Apenas o suporte VLUMA (Super Admin) altera razão social e CNPJ";
  Super Admin (impersonação, rollback) grava e registra histórico com
  fonte. BrasilAPI pelo navegador → 200 "INFOXTEC TECNOLOGIA E SERVICOS
  LTDA"; formatação → "Infoxtec Tecnologia e Servicos Ltda." (a Receita
  não tem acentos). **Tela Empresas do Super Admin não testada pelo
  navegador** (sem a senha dessa conta) — validação pelo usuário
- **Tela Empresas / Identidade legal validada pelo usuário como Super
  Admin em 2026-09-24** ("Validado")

### Bloco D — decisões (2026-09-24)
- Três opções de envio por plano (Básico / Intermediário / Avançado) —
  ver VISAO_ATOS.md, F6. Super Admin libera por empresa até a F8
- Remetente padrão **noreply@vluma.com.br** (Zoho, smtp.zoho.com:465
  SSL) — login testado ok; credencial guardada SÓ como segredo do
  servidor (`SMTP_PADRAO_HOST/USUARIO/SENHA`), nunca no git. **A senha
  de app foi enviada pelo chat → trocar no fim do MVP**, junto com os
  tokens (mesma política)

### Blocos D + E — envio do relatório (2026-09-24)
- **Na OS concluída** (técnico e admin), no card "Relatório do
  atendimento", quando o PDF existe: **"Enviar por WhatsApp"** (celular
  com DDD + mensagem editável → abre o WhatsApp DO APARELHO com a
  mensagem e o link de verificação; registra `report_sent` com telefone
  mascarado) e **"Enviar por e-mail"** (Edge Function
  `enviar-relatorio`: PDF anexado + botão "Abrir o relatório e conferir
  a autenticidade"; remetente padrão "<Empresa> via ATOS"
  <noreply@vluma.com.br> com Responder-para = e-mail de contato da
  empresa, ou o e-mail próprio no nível Intermediário+; registra evento
  com e-mail mascarado). Linha do tempo: "Relatório enviado · Por
  WhatsApp/e-mail para …"
- **Regras no servidor** (e-mail): mesma empresa, OS concluída com PDF,
  canal ligado; técnico só se permitido (todos / escolhidos / nenhum);
  admin/gestor sempre. WhatsApp é link — a tela esconde o botão de quem
  não pode
- **Configurações → "Envio do relatório"** (admin): nível do plano,
  canais on/off, mensagem padrão com {cliente} {os} {empresa} {link}
  (precisa ter {link}) + exemplo ao vivo, quem pode enviar (Bloco E,
  MultiCombobox de técnicos), e-mail próprio (Intermediário+: servidor,
  usuário, senha → Vault, remetente; porta fixa 465; "Testar envio")
- **Empresas (Super Admin)**: nível de envio por empresa (até a F8)
- Nível Avançado (WhatsApp automático) ainda sem implementação — será
  refinado com o usuário usando a **Evolution já instalada na VPS
  dele**, com criação de instância e QR Code pela tela do ATOS
- **Achado testando (corrigido)**: a biblioteca denomailer estourava o
  limite de processamento da Edge Function (WORKER_RESOURCE_LIMIT) até
  num e-mail simples sem anexo. Trocada por **nodemailer** (`npm:`),
  porta 465 SSL — e-mail simples em 2,6 s. Mantido um modo
  `diag` (só admin) que envia e-mail simples pelo remetente padrão,
  útil para suporte. A tela passou a mostrar o erro real devolvido
  pela função, não só a mensagem genérica
- Testado ponta a ponta (URL pública, técnico e admin reais, OS-0022):
  **WhatsApp** — celular incompleto recusado, máscara "(71) 99999-1234",
  abriu api.whatsapp.com/send com o número e a mensagem montada
  (empresa, OS, cliente, link de verificação), evento "(71) 9****-1234";
  **e-mail via ATOS** com PDF anexado ACEITO pelo servidor Zoho para adm@vluma.com.br, evento
  "a***@vluma.com.br, remetente atos"; **Bloco E** — "Nenhum técnico" →
  botões somem para o técnico e o servidor recusa (403) mesmo chamando
  direto; restaurado "Todos"; **nível Básico** — e-mail próprio
  bloqueado na tela; **nível Intermediário** (definido pelo Super Admin)
  — e-mail próprio configurado (conta noreply usada só no teste), senha
  no Vault ("cadastrada"), "Testar envio" aceito pelo servidor, envio do técnico
  "pelo e-mail da empresa". Limpeza ao final: e-mail próprio desligado,
  senha removida do Vault, Infoxtec de volta ao nível Básico
- **Correção de registro (2026-09-24, apontada pelo usuário)**: os
  destinos usados nos testes (adm@vluma.com.br, adm@infoxtec.com.br)
  **não existem como caixas de e-mail** — o que foi comprovado é que o
  servidor Zoho ACEITOU as mensagens (sem erro); a ENTREGA não foi
  comprovada (provavelmente voltaram como "endereço inexistente" para
  noreply@). Entrega real fica para o teste do usuário com um e-mail
  próprio

### Nível Avançado (WhatsApp automático) — desenho aprovado, aguardando (2026-09-24)
- Desenho da integração com a Evolution (instância por empresa, QR Code
  pela tela do ATOS, aviso de risco com aceite, envio automático com
  PDF, fallback para o modo aparelho) **aprovado pelo usuário e
  documentado no VISAO_ATOS.md (F6)** — **não desenvolver ainda**: o
  usuário vai primeiro testar os Blocos D/E recém-entregues. Como
  oferecer (Evolution / API oficial / as duas, e em qual plano) fica
  para a discussão de planos. Pendente do usuário: URL, chave global e
  versão da Evolution

---

## 🔚 Estado ao encerrar a sessão de 2026-09-24 (retomar por aqui)

**Fase atual: F6 em andamento** — Blocos A (assinatura no encerramento),
B (evidências: câmera embutida, carimbo configurável, código/QR de
autenticidade, ZIP, liberar espaço), C (relatório PDF automático no
servidor), D níveis Básico e Intermediário (WhatsApp pelo aparelho,
e-mail "via ATOS" ou próprio) e E (quem pode enviar) **feitos e
testados**. Falta: **nível Avançado do D** (Evolution — desenho aprovado,
não desenvolvido). Depois: F7 (painel gerencial).

**Migrations desta sessão (023–034): todas aplicadas no DEV, PRD
pendente** (esperado — só na promoção do MVP; ver tabela da seção 6).

### Pendências abertas
1. **Usuário testar Blocos D/E com e-mail e celular REAIS** (os destinos
   usados nos testes não existem): e-mail "via ATOS" com PDF, WhatsApp
   pelo aparelho, "Nenhum técnico", e-mail próprio (nível Intermediário
   via Empresas). Nada foi confirmado como ENTREGUE ainda
   → **Atualização 2026-09-25: testes realizados pelo usuário, sem
   problema relatado.**
2. **Nível Avançado (Evolution)**: aguardando os testes acima + URL,
   chave global e versão da Evolution da VPS do usuário. Desenho no
   VISAO_ATOS.md (F6)
3. Decidir depois do item 1: fechar a F6 (Evolution) ou seguir para a F7
4. **Discussão de planos (F8)** — acumulou pauta: níveis de envio
   (Básico/Intermediário/Avançado), Evolution x API oficial, custos
   variáveis (VISAO 7.1: geocodificação, armazenamento, egress),
   retenção de fotos, plano do Supabase (Free não sustenta operação real)
5. Backlog: dashboard do Super Admin (UX do consumo de endereços e
   armazenamento)
6. Admin da Infoxtec preencher dados reais em "Marca e dados da
   empresa" (nome de exibição, telefone, e-mail de contato, site)
7. Acompanhar: 401 isolado no console visto uma vez (não reproduzido);
   `npm audit` com 4 vulnerabilidades pré-existentes em ferramentas de
   build (F10)
8. Dados de teste no DEV: OS-0018 a OS-0024 (e fotos de teste na
   OS-0010). DEV = HML, sem dados reais
9. **(2026-09-25) Checklist avulso — nome e recorrência, aguardando
   decisão.** Usuário não gostou do termo "avulso" e esperava
   recorrência como a do Outlook (periodicidade). Estado real conferido
   no código: `checklist_instances.recurrence` é **texto livre**
   (placeholder "Ex: mensal, semanal"), exibido só como etiqueta — nenhuma
   ocorrência é gerada, sem data prevista nem atraso. Proposta levada
   (nome + recorrência estruturada) registrada no VISAO_ATOS.md, F5
   → **Atualização 2026-09-25 (decisões do usuário):** (a) nome: manter
   "Checklist avulso" por enquanto (proposta "Inspeções" não adotada
   agora); (b) recorrência será feita ANTES da F7; (c) desenho da tela
   ainda não aprovado — usuário pediu detalhe da UX (modal?) e exemplos
   de combinações (diário conta sábado/domingo?)
   → **Atualização 2026-09-25:** UX aprovada (atalhos + "Personalizar..."
   em modal; fim de semana só com aviso); dia 31 em mês curto decidido
   pela equipe = último dia do mês. Feriados viraram pedido de módulo
   próprio "Calendário e Jornada" (feriados, escala, horário de
   atendimento → base de ponto, escala e SLA) — proposta em 4 etapas no
   VISAO_ATOS.md 9.8, aguardando decisão
   → **Atualização 2026-09-25:** Etapa 1 aprovada; Etapas 2–3 fora do
   MVP; **ponto descartado** (complexidade formal) e substituído por
   notificação diária ao funcionário (onde iniciar + OS/checklists do
   dia) — a refinar, usuário tem desenvolvimento aproveitável; horário
   de atendimento por empresa x por equipe — a refinar

### Módulo Calendários — Etapa 1 (2026-09-25) — CONCLUÍDA
**Atualização 2026-09-25 (mesma data): migration aplicada, publicado e testado ponta a ponta na URL pública — ver "Aplicação e testes" ao fim desta seção. Título anterior: "EM ANDAMENTO"; o texto abaixo foi escrito antes da aplicação e é mantido como histórico.**
- Decisões e desenho: VISAO_ATOS.md 9.8 (nome, conceitos, ordem)
- **Migration 035** (arquivo pronto, NÃO aplicada ainda — aguardando
  token da Management API): fuso e sede da empresa; `feriados` em
  camadas (plataforma/estadual/municipal por IBGE/empresa; feriado /
  ponto facultativo / expediente reduzido com janela; "repete todo ano")
  + `feriados_efeito_empresa` (a empresa decide folga/normal/reduzido);
  `horarios_atendimento` nomeados com um padrão ("Comercial" seg–sex
  08–18 criado para toda empresa); `locations.cidade_ibge` e
  `horario_funcionamento`; funções `feriados_do_dia`, `periodos_do_dia`,
  `eh_dia_util`, `proximo_dia_util`, `horas_uteis_entre`,
  `somar_horas_uteis` (base do SLA), `situacao_do_dia`,
  `unidade_aberta`; feriados nacionais 2025–2036 gerados (Páscoa
  calculada; Carnaval/Cinzas/Corpus Christi como ponto facultativo;
  Consciência Negra nacional desde 2024)
- Lógica SQL validada localmente (PGlite) antes de aplicar: Páscoa
  2024–2030 igual à BrasilAPI; 12/10 sem expediente; municipal de
  Salvador não vale em Feira de Santana; 24/12 reduzido → 08–12; Cinzas
  reduzido → 14–18; horas úteis sex 17h → ter 10h com feriado na segunda
  = 3 h; 24x7 ignora feriado; padrão não pode ser excluído/desativado;
  técnico sem permissão. **Não substitui o teste na URL pública**
- Telas (código pronto, build ok, não publicado — publicar só depois da
  migration, senão Unidades quebra): menu **Calendários** (abas Feriados
  e Horários de atendimento + "Conferir uma data"; Super Admin vê
  "Calendários da plataforma"), fuso em Configurações, Unidade com UF +
  cidade da lista do IBGE e horário de funcionamento opcional

**Aplicação e testes (2026-09-25):**
- Migration 035 aplicada no DEV via Management API: 168 feriados
  nacionais (2025–2036) e "Comercial" padrão criado para as 3 empresas
- Unidades antigas → código IBGE pelo script versionado
  `supabase/scripts/ajustar_cidade_ibge.py` (só casa nome + UF exatos
  com a lista oficial; sem adivinhar): 5 de 10 ajustadas (Salvador/BA);
  as outras 5 não têm cidade nenhuma — a tela da Unidade avisa
- Testado ponta a ponta (Playwright, URL pública, admin real; 0 erros de
  console): menu Calendários; sede Salvador - BA; feriado municipal
  (Salvador, 08/12), estadual (BA, 02/07) e da empresa com expediente
  reduzido (24/12 até 12:00), todos "repete todo ano"; validação de
  reduzido sem horário; Carnaval marcado como folga. "Conferir uma
  data": 12/10 sem expediente; 13/10 08–18; 08/12 sem expediente na sede
  e na unidade "Feira II" (Salvador) mas **dia útil numa unidade de Feira
  de Santana** (municipal não vaza para outra cidade); 02/07 e 02/07/2027
  sem expediente; 24/12 08–12; Carnaval folga; Cinzas normal (padrão).
  Horários: validação fim antes do início; modelo "com almoço" salvo
  (08–12 e 13–18); 24x7 "ignora feriados" → Natal com expediente 00–24;
  tornar padrão (padrão sem botão excluir); nome duplicado bloqueado.
  Unidade nova em Feira de Santana (IBGE 2910800) com horário seg–sex
  10–22, sáb 08–18 gravado. Fuso salvo (Manaus) no banco
- Segurança (impersonação SQL com rollback): técnico lê feriados mas não
  cria/altera nada (RLS e "Sem permissão" nas funções); admin não cria
  feriado nacional nem em outra empresa, não altera/exclui nacional (0
  linhas), não vê horários de outra empresa, não exclui o padrão;
  controle positivo: admin altera o próprio horário (1 linha)
- Funções no banco real: horas úteis sex 17h → ter 10h com feriado na
  segunda = 3 h; prazo de 4 h úteis a partir de sex 17h = ter 11h;
  próximo dia útil após sáb 10/10 = ter 13/10; unidade aberta seg 11h
  sim, seg 9h não, domingo não
- Técnico em /calendarios → redirecionado para /campo. Super Admin:
  "Calendários da plataforma", sem abas nem coluna de efeito, não vê os
  feriados da Infoxtec, edita nacionais; 2035 já gerado (Carnaval 05/02)
- **Achados no teste e corrigidos**: (1) id duplicado entre o campo
  nome do feriado e o seletor de cidade (quebrava a escolha da cidade no
  modal); (2) no celular os filtros empilhavam e depois criaram rolagem
  horizontal (452 px) — agora quebram linha (393 px, sem rolagem);
  (3) caixa de efeito com largura variável; (4) nome duplicado de
  horário checado na tela antes de enviar (evita erro 409); (5) texto da
  Unidade prometia aviso que ainda não existe — ajustado
- **Dados que ficaram no DEV (reais, úteis para a Infoxtec)**: sede
  Salvador - BA; feriados Nossa Senhora da Conceição da Praia (Salvador,
  08/12), Independência da Bahia (02/07) e Véspera de Natal (24/12 até
  12:00). Desfeitos: Carnaval como folga, horário 24x7, almoço no
  Comercial, fuso Manaus, unidade de teste em Feira de Santana

### Endereço de Clientes/Unidades (2026-09-25) — CONCLUÍDO
**Atualização 2026-09-25 (mesma data): proposta aprovada pelo usuário (glossário, endereço só na Unidade, CPF ou CNPJ, UF + cidade obrigatórias), construída (migration 036) e testada na URL pública — ver "Entrega e testes" abaixo. Título anterior: "levantado em 2026-09-25, aguardando decisão".**
- **Pedido do usuário**: os clientes da Infoxtec não têm UF/cidade;
  definir a terminologia (clientes da plataforma x clientes das
  empresas) e ajustar ANTES da recorrência
- **Diagnóstico**: o Cliente tem um único campo livre "Endereço"
  (obrigatório na tela, mas o Atakarejo está vazio — cadastrado antes);
  esse texto só é copiado para a Unidade principal na CRIAÇÃO do cliente
  (gatilho da migration 004) — **editar o endereço do cliente depois não
  atualiza a Unidade** (dados divergem). Nomes das Unidades principais =
  nome do cliente (por isso "Cliente Trigger Teste"/"SERGIO…" aparecem
  como Unidades)
- BrasilAPI conferida: CEP devolve rua, bairro, cidade, UF **e código
  IBGE**; CNPJ devolve endereço completo **e código IBGE** (Infoxtec:
  Rua Silveira Martins, 27, sala 102, Cabula, Salvador/BA, 2927408)
- Proposta (glossário, endereço estruturado só na Unidade, CEP/CNPJ
  preenchendo, sede pela Receita) no VISAO_ATOS.md 9.8
- **Dúvida respondida**: "repete todo ano" = mesmo dia e mês todo ano,
  qualquer dia da semana; feriado de data móvel é cadastrado por ano

**Entrega e testes (2026-09-25):**
- Migration 036 (ver seção 6): `locations.cep/logradouro/numero/
  complemento/bairro`; gatilho monta `address` ("Rua X, 27 - Sala 102 -
  Bairro", compatível com PDF, OS e "Abrir no mapa") e acerta a UF pelo
  código IBGE; `cpf_valido`, `formatar_documento` e gatilho que valida
  CPF/CNPJ do cliente **só quando o documento muda** (cadastro antigo
  inválido não trava outras edições); `salvar_cliente()` grava cliente +
  unidade principal numa transação (SECURITY INVOKER — RLS vale), cria a
  principal se não houver e permite escolher uma unidade existente como
  principal; `definir_sede_tenant()` (Super Admin). Lógica validada no
  PGlite antes de aplicar
- Tela **Clientes**: "CPF ou CNPJ" com máscara e validação, botão
  **Receita** (só CNPJ) preenche nome/telefone/e-mail vazios e o
  endereço completo com código IBGE; bloco "Endereço principal" (CEP
  preenche rua, bairro, UF e cidade); sem unidade principal → escolher
  uma existente ou criar; colunas **Cidade** e **Unidades** (antes
  "Locais"), avisos "sem cidade" / "sem unidade principal"
- Tela **Unidades**: mesmo formulário de endereço; cidade obrigatória;
  aviso "sem cidade" na lista. **Empresas** (Super Admin): consulta à
  Receita também grava a **sede** (cidade); lista mostra a sede
- Script `ajustar_cidade_ibge.py` ganhou a 2ª passada (nome oficial da
  cidade): "Feira II" SALVADOR → Salvador
- Testado ponta a ponta (URL pública, admin e Super Admin reais, 0 erros
  de console): CNPJ público do Banco do Brasil → nome, telefone,
  endereço e Brasília/DF (IBGE 5300108) gravados na unidade principal;
  CPF inválido barrado; sem cidade barrado; CEP 41150-000 → Rua Silveira
  Martins/Cabula/Salvador; edição do endereço do cliente atualiza a
  unidade principal **sem duplicar** e o texto do cliente acompanha;
  cliente sem principal com 2 unidades → escolheu "Filial Antiga", que
  virou principal; Atakarejo (real, só aberto, sem salvar) oferece Feira
  II / LOJA 53 / nova; unidade nova por CEP ("Praça da Sé, S/N -
  Centro"); Super Admin com sede apagada → Receita → "Salvador - BA"
  gravada. Segurança (impersonação, rollback): técnico não salva
  cliente; admin não usa unidade de outra empresa como principal; CNPJ
  inválido recusado pelo banco; só Super Admin define sede de empresa.
  Clientes/unidades de teste apagados ao final
- **Achados no teste e corrigidos**: (1) Receita grava cidade sem acento
  ("Brasilia") → nome vem da lista oficial do IBGE; (2) "SN" → "S/N";
  (3) Atakarejo aparecia "sem cidade" quando o problema real é não ter
  unidade principal → aviso próprio; (4) **no celular, a tabela deixava
  a página mais larga que a tela (867 px), empurrando o botão "Novo
  cliente" e descentralizando os modais** — causa: `<main>` do painel
  sem `min-w-0`; corrigido de uma vez para todo o painel (Clientes,
  Unidades, OS, Técnicos, Calendários, Configurações, Checklists: 393 px
  no celular, desktop inalterado). O restante da responsividade do
  painel continua no backlog
- **CPF ou CNPJ na Unidade (pedido do usuário, 2026-09-25, migration
  037)**: campo opcional com a mesma validação do Cliente (regra única
  `normalizar_documento()` no banco, usada por Cliente e Unidade; valida
  só quando o documento muda), botão **Receita** (preenche nome vazio e
  endereço) e **aviso sem bloquear** quando a raiz do CNPJ (8 primeiros
  dígitos) difere da do cliente — filial legítima tem a mesma raiz da
  matriz. Campo + botão viraram o componente `DocumentoReceita`,
  compartilhado por Cliente e Unidade. Lista de Unidades mostra o
  documento sob o nome. Testado ponta a ponta (URL pública, admin real, 0
  erros): regressão do Cliente pela Receita (CNPJ da Infoxtec → nome
  "Infoxtec", Rua Silveira Martins, 27, Salvador); unidade com CNPJ de
  outra raiz → aviso + Receita preencheu nome/Brasília; CNPJ inválido
  barrado; mesma raiz → aviso some, salvo formatado; edição trocou para
  CPF e salvou; no banco (rollback) CPF inválido recusado e alteração de
  outro campo numa unidade sem documento segue funcionando. Dados de
  teste apagados
- **Atualização 2026-09-25: pendência abaixo RESOLVIDA pelo usuário pela tela** — Atakarejo ganhou a unidade principal "Atakarejo" (12:57, CNPJ 73.849.952/0010-49 pela Receita, Av. Santiago de Compostela, 425, Brotas) e "Clinte Teste" ganhou a sua (13:00). Nenhum cliente da Infoxtec está sem principal. Texto original mantido:
- **Pendência de dados (usuário)**: Atakarejo sem unidade principal
  (escolher Feira II ou LOJA 53 no modal); "Clinte Teste" sem nenhuma
  unidade (completar o endereço no modal cria a principal). As 5
  unidades antes sem cidade foram completadas pelo usuário pela tela em
  2026-09-25 (12:16–12:17)

### Recorrência dos checklists avulsos (2026-09-25) — CONCLUÍDA
- Desenho aprovado antes (VISAO_ATOS.md F5): campo "Repetir" com
  atalhos + "Personalizar..." em modal; fim de semana/feriado só com
  aviso; dia 29–31 → último dia do mês; série separada das ocorrências;
  geração pelo banco; "esta e as seguintes" / "só esta"; pausar. Nome
  "Checklist avulso" mantido (decisão do usuário)
- **Migration 038** (ver seção 6): `fn_regra_erro`, `datas_da_regra`
  (pura — a MESMA usada na prévia e na geração), `datas_da_serie`
  ("todo dia útil" pelo horário de atendimento padrão + feriados da
  cidade da unidade; término nunca/após N/em data), tabela
  `checklist_series` (sem escrita direta — só pelas funções),
  `checklist_instances.serie_id/data_prevista/prazo` (único por série +
  data), `previa_recorrencia`, `gerar_ocorrencias` (só servidor/cron;
  janela de 7 dias; nunca gera datas anteriores à criação; marca
  `gerado_ate` para não recalcular o passado; encerra a série quando a
  última ocorrência passa), `salvar_serie` (criar / alterar "esta e as
  seguintes" a partir de uma data: refaz só as futuras NÃO iniciadas),
  `definir_situacao_serie` (pausar/retomar/encerrar — pausar remove as
  futuras não iniciadas), `alterar_ocorrencia` ("só esta": data, prazo,
  técnicos). **pg_cron** instalado; job `atos-gerar-ocorrencias` de hora
  em hora (minuto 7)
- Lógica validada no PGlite antes de aplicar (datas conferidas com os
  exemplos combinados com o usuário: a cada 2 dias, seg/qua/sex,
  quinzenal, dia 31, 1ª segunda, última sexta, 29/02, dia útil pulando
  12/10)
- Telas: **Checklists avulsos** com abas *Checklists* (ocorrências com
  data, prazo, selo "Atrasado", chip da repetição, "Remarcar só este") e
  *Recorrências* (resumo, próxima data, técnicos, Editar / Pausar /
  Retomar / Encerrar); formulário com Data/"Começa em", **Prazo para
  concluir** (mesmo dia, até o dia seguinte, 3…30 dias) e o campo
  **Repetir** (`RecorrenciaCampo`: atalhos da data escolhida + modal
  Personalizar com intervalo, dias da semana, modos do mês, término,
  resumo e próximas 5 datas do banco, com aviso de fim de
  semana/feriado). App do técnico: cartões **Hoje / Atrasados /
  Próximos / Concluídos** (hoje no fuso da empresa), data e prazo em
  cada cartão. Resumo e RRULE (padrão iCalendar) montados em
  `src/lib/recorrencia.ts`
- Testado ponta a ponta (URL pública, admin e técnico reais, 0 erros de
  console): único com data passada → "Atrasado"; atalhos de sexta
  25/09 ("Toda sexta", "Todo mês, no dia 25", "na 4ª sexta-feira", "na
  última sexta-feira", "Todo ano, em 25 de setembro"); semanal → prévia
  5 sextas e banco com 25/09 (prazo 26/09) e 02/10 (janela de 7 dias) +
  técnico atribuído; Personalizar "Todo dia útil, 5 vezes" → 25/09,
  28/09, 29/09, 30/09, 01/10 (pula o fim de semana), 5 no banco; aviso
  com Sábado, Domingo e Nossa Senhora Aparecida; dia 31 → 31/10, 30/11,
  31/12, 31/01, 28/02; editar "segunda e sexta" a partir de hoje → 25/09,
  28/09, 02/10; remarcar só a de 02/10 → 03/10; pausar (fica só a de
  hoje), retomar (5 de novo), encerrar; técnico no celular: Hoje 2,
  Atrasados 1 ("prazo era 20/09"), Próximos 2 (28/09, 03/10), abriu e
  concluiu uma ocorrência → Concluídos 1. Segurança (impersonação,
  rollback): técnico não cria/pausa/remarca nem dispara a geração;
  admin não grava série direto na tabela; regra inválida recusada
- **Atualização 2026-09-25 (mesma data) — os 3 "limites" abaixo foram CORRIGIDOS pela migration 039.** Eles ficaram de fora da primeira entrega por decisão minha, sem consulta ao usuário (dois contrariavam o desenho aprovado e um era defeito); o usuário apontou que não se pede validação com ajustes pendentes. Correções: (1) **defeito** — editar a série reancorava o ritmo mesmo sem mudar a repetição; agora, se a regra não muda (`fn_regra_norm` ignora ordem dos dias), o início original é mantido e só uma regra nova começa na data escolhida; (2) aviso de fim de semana/feriado também no checklist que não se repete e em "Remarcar só este"; (3) aviso de **unidade fechada** no dia da semana (horário de funcionamento da unidade, migration 035) na prévia, no checklist único e ao remarcar — tudo pela mesma função `aviso_da_data()`, sem bloquear. Ajuste de UX junto: criar checklist único leva para a aba Checklists. Testado na URL pública (0 erros): "a cada 2 dias" 25/09, 27/09, 29/09, 01/10 → trocado só o título → mesmas datas; 12/10 → "Nossa Senhora Aparecida"; unidade de teste fechada aos domingos → prévia "todo domingo" e remarcar para 11/10 avisam "Domingo · Unidade fechada", 13/10 e 14/10 sem aviso; regressão completa da recorrência (admin + técnico) repassada. Texto original:
- **Limites conhecidos (v1)**: "esta e as seguintes" reancora a série
  na data escolhida (ex.: "a cada 2 dias" passa a contar dali);
  "Remarcar só este" não avisa se a nova data cai em feriado; o aviso
  de horário de funcionamento da unidade (migration 035) ainda não é
  usado aqui — ocorrências são por dia, sem hora
- Dados de teste: série "Teste Semanal" e "Teste Dia Util", checklist
  "Teste Único Atrasado" — apagar depois da validação do usuário

### Credenciais a trocar no FIM do MVP (não antes — decisão do usuário)
Token de acesso do Supabase (Management API), PAT do GitHub embutido no
remote de `C:\vluma\atosdev`, senha de app do Zoho de
noreply@vluma.com.br (segredo `SMTP_PADRAO_SENHA`), chave do LocationIQ
(cadastrada pela tela do Super Admin).
**2026-09-25:** novo token da Management API e as senhas dos usuários de
teste (Super Admin, admin Infoxtec, técnico atendimento@) foram enviados
pelo chat — trocar também no fim do MVP (guardados só no scratchpad da
sessão, nunca no git).

### Checklist da promoção para PRD (zeejmwdyqrbjnkhwtdsu)
- Aplicar migrations 001–039 em ordem. **038 instala o pg_cron e agenda
  `atos-gerar-ocorrencias`** — conferir `select * from cron.job` no PRD. Depois da 036, rodar
  `supabase/scripts/ajustar_cidade_ibge.py <ref PRD> --aplicar` (código
  IBGE das Unidades existentes) e conferir que os feriados nacionais do
  ano estão gerados (a migration gera 2025–2036; depois disso, botão
  "Gerar nacionais" do Super Admin em Calendários). **Atenção migration 030**: o
  gatilho `fn_orders_relatorio_ao_concluir` tem a URL do projeto DEV
  (`vgkiddqahubznlzkxfgb`) escrita — trocar pelo ref do PRD
- Publicar as Edge Functions: `criar-tecnico` (verify_jwt true),
  `verificar-foto` (false — pública), `geocodificar` (true),
  `gerar-relatorio-os` (true), `enviar-relatorio` (true)
- Segredos das funções: `SITE_URL` (domínio do PRD), `SMTP_PADRAO_HOST`
  / `SMTP_PADRAO_USUARIO` / `SMTP_PADRAO_SENHA`
- Vault: criar `atos_service_role_key` com a chave de serviço do PRD
  (usada pelo gatilho do PDF)
- Extensão `pg_net` (a migration 030 cria) e limite do bucket
  `evidencias` em 25 MB (a migration 030 ajusta)
- Super Admin: cadastrar a chave do LocationIQ em Configurações →
  "Plataforma — endereço no carimbo" (mesmo provedor do DEV)
- Keep-alive do Supabase (VISAO 9.5) em todos os ambientes

