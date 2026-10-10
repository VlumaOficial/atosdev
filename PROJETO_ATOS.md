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
| 040_lista_checklists_avulsos | listar_checklists_avulsos (página + total + contagens, filtros, situação no banco), proximas_das_series | OK | Pendente | Sim |
| 041_lista_os | listar_os (página + total + contagens; situação, aberta em, cliente, unidade, técnico/sem técnico, prioridade, busca) | OK | Pendente | Sim |
| 042_orders_leitura_tecnico | orders_select: técnico lê só as OS atribuídas a ele | OK | Pendente | Sim |
| 043_seguranca_tecnico_dados_os | pode_ver_os, pode_ver_checklist, pode_acessar_arquivo; policies de checklist_instances/answers/targets/answer_history (histórico só leitura), order_comments/events/evidences/reports, fotos_verificacao e storage evidencias restritas ao que o técnico pode ver | OK | Pendente | Sim |
| 044_sla_itsm | catálogo (os_categorias), motivos_pausa, sla_politicas, config de prioridade/risco no tenant, campos de tipo/classificação/SLA na OS, gatilho fn_orders_sla, sla_situacao, previa_sla, salvar_config_prioridade, listar_os com SLA; prioridades convertidas | OK | Pendente | Sim |
| 045_alertas_sla | orders.sla_alerta_*; gatilho de reset; notificacoes + marcar_notificacoes_lidas + verificar_alertas_sla; realtime; job atos-alertas-sla (5 min) | OK | Pendente | Sim |
| 046_painel_gerencial | tenants.sla_meta_pct + definir_meta_sla; orders.tempo_atendimento_min/tempo_solucao_min (gatilho na conclusão + backfill); fn_primeira_visita, painel_desempenho, painel_gerencial; listar_os com várias prioridades | OK | Pendente | Sim |
| 047_lista_os_periodo_conclusao | listar_os aceita periodo_por = conclusao (links do painel) | OK | Pendente | Sim |
| 048_seguranca_cadastro_publico | handle_new_user não aceita perfil vindo do cadastro; contas do portal não viram usuários internos (+ Auth: cadastro público desligado, site_url corrigido) | OK | Pendente | Sim |
| 049_seguranca_politicas_escrita | users: admin só na própria empresa, gestor só técnicos, gatilho trg_users_protege (sem trocar empresa, sem mudar o próprio perfil, sem promover a super_admin); order_comments/order_evidences update exigem pode_ver_os | OK | Pendente | Sim |
| 050_seguranca_funcoes | revoga execução de sla_politica_para, fn_motivos_pausa_padrao e fn_os_tempos_uteis pelos usuários | OK | Pendente | Sim |
| 051_portal_fundacao | portal E1: config do portal no tenant, nomes curtos antigos, plataforma, endereços, pessoas e vínculos, termos versionados + aceites, auditoria, bucket portal-publico, funções portal_* e de configuração | OK | Pendente | Sim |
| 052_portal_pessoa_nao_interna | gatilho em auth.users remove a linha interna órfã quando a conta é marcada como do portal | OK | Pendente | Sim |
| 053_seguranca_papel_nulo | get_meu_role() devolve 'nenhum' para quem não tem perfil interno (guardas das funções); feriados da plataforma só para usuários internos | OK | Pendente | Sim |
| 054_portal_termos_recusa | consentimento de comunicação opcional: portal_aceitar_termos(aceitos, recusados); pendente = versão sem nenhuma resposta | OK | Pendente | Sim |
| 055_portal_endereco_oficial | portal_resolver devolve host_oficial e interno (cliente só entra pelo endereço oficial; caminho interno só prévia da equipe) | OK | Pendente | Sim |
| 056_perfil_atendente | users.role aceita 'atendente'; Atendente abre/edita OS (não exclui) | OK | Pendente | Sim |
| 057_grupos_atendimento | grupos de atendimento + membros, ficha do catálogo (portal/grupo padrão), OS com grupo e roteamento, transferir_os/assumir_os, histórico, alerta de pingue-pongue, alertas de SLA ao coordenador | OK | Pendente | Sim |
| 058_lista_os_filas | listar_os com filtro/coluna de grupo e contagem "novos sem grupo" | OK | Pendente | Sim |
| 059_usuario_inativo_sem_acesso | get_meu_role()/get_meu_tenant() tratam usuário desativado como sem perfil | OK | Pendente | Sim |
| 060_portal_clientes | portal por cliente, equipes, convites (hash do token), pedidos de acesso, papel no cliente, gestão de pessoas, LGPD (exportar), chave do anti-robô, avisos com destino | OK | Pendente | Sim |
| 061_portal_chamados | origem/solicitante/equipe nas OS, anexos do cliente (bucket privado portal-anexos), também me afeta, preferências, avisos enviados, funções do portal (abrir, listar, obter, parecidos, datas, preferências), configuração de abertura, info do chamado para a equipe | OK | Pendente | Sim |
| 062_portal_avisos_email | gatilho (pg_net + Vault) que chama portal-avisos ao abrir/mudar a situação do chamado — **URL do DEV escrita** | OK | Pendente | Sim |
| 063_portal_convite_celular | portal_convites.celular: o celular do "Solicitar acesso" acompanha o convite até a tela de criar senha e o cadastro da pessoa | OK | Pendente | Sim |
| 064_email_unico | índice único por e-mail (sem diferenciar caixa) em users e portal_pessoas + travas entre equipe interna e portal (nenhum e-mail existe nos dois lados) | OK | Pendente | Sim |
| 065_portal_tipos_independentes | o tipo de chamado do portal depende só da configuração da empresa; assunto obrigatório só quando há categorias visíveis para o tipo (portal_abertura_config e portal_abrir_chamado) | OK | Pendente | Sim |
| 066_portal_conversa_triagem | E5a: comentários com visibilidade (interno/cliente) e autoria do cliente, mensagens do cliente com até 3 fotos, `os_comentar`, `portal_enviar_mensagem`, triagem do N1 (`os_triagem`: confirmar/reclassificar), conversa e reclassificação no portal, aviso por e-mail de nova mensagem — **URL do DEV escrita no gatilho** | OK | Pendente | Sim |
| 067_pausa_cliente_reagendamento | E5b-1: comportamento dos motivos de pausa (aciona/comunica/interno, texto ao cliente, exige previsão), pausa "Aguardando você" com retomada pela resposta do cliente, previsão de retorno + alerta de vencimento (pg_cron `atos-previsoes-pausa` a cada 15 min), agendar/reagendar a pedido do cliente PAUSA o SLA mantendo o tempo gasto (`sla_agend_*`), limite de agendamentos por chamado — **URL do DEV no gatilho; usa pg_cron** | OK | Pendente | Sim |
| 068_transparencia_prazo | E5b-2: transparência do prazo (`sla_transparencia` na empresa e exceção por cliente: oculto/previsão/completo), "prazo explicado" no andamento (pausas visíveis, retomadas, agendamento a pedido do cliente) | OK | Pendente | Sim |
| 069_agendamento_combinado | E5b-3: regras de agendamento da empresa (antecedência, horizonte, janelas, reagendar/cancelar pelo cliente com limites, até 3 lembretes), data "confirmada" × "proposta", `portal_responder_agendamento`, `portal_cancelar_agendamento`, lembretes (pg_cron `atos-lembretes-agendamento`) — **URL do DEV na rotina de lembretes** | OK | Pendente | Sim |
| 070_cliente_ausente_visita | E5b-4: motivos de cancelamento cadastráveis (sistema: Cancelado pelo cliente, Cliente ausente), visita improdutiva, `relacionada_a`, `os_gerar_chamado` (visita gera Incidente/Requisição ligados), `portal_pedir_nova_visita` | OK | Pendente | Sim |
| 071_resolvido_fechado | E5c: Resolvido → Fechado (`fechada_em`, confirmar / "não foi resolvido" / fechamento automático por pg_cron `atos-fechar-resolvidos`), assinatura do solicitante como confirmação, novo chamado ligado, crédito de SLA na reabertura, `portal_relatorio_chamado` (PDF); revoga execução das funções-semente da 070 | OK | Pendente | Sim |

---

## 7. BACKLOG

### Levantado na tabela oficial (pós-MVP)
- [ ] F8: Planos, Asaas, cobrança, trial
- [ ] Auto-cadastro, landing page, anti-fraude
- [ ] Sessão única, validação CPF/CNPJ
- [ ] F9: Integração GLPI
- [ ] F10: OWASP
- [ ] F11: Manual + docs
- [ ] **Orçamento como opção da OS** (decisão do usuário, 2026-10-10: **vai para o BACKLOG**; fora da sequência até o PRD). Será uma **opção dentro da OS**: **todo Incidente e toda Requisição terá a opção de gerar orçamento, tenham ou não sido gerados por uma Visita** (decisão do usuário, 2026-10-10; a OS gerada por uma Visita é só um dos casos), integrando ou reaproveitando o sistema de orçamento que o usuário já tem. Perguntas ainda abertas, para quando entrar em refinamento: qual é o sistema (nome, onde roda, tecnologia, API, multi-empresa); integrar ou reaproveitar o código; quem aprova no portal; aprovado vira OS de execução?; faturamento fica de fora?. **Sem retrabalho:** a E5c já cria o vínculo "relacionada a" e a origem "visita" (a Visita gera Incidente/Requisição ligados).

### Levantado durante o desenvolvimento
- [ ] Portal do Solicitante/Cliente — área onde o contato do cliente acompanha e comenta as OS dele (quando existir, o solicitante vira tipo de usuário e pode comentar) — *2026-10-02: retomado pelo usuário com desenho de perfis (Supervisor/Usuário/equipes); parecer e perguntas em VISAO_ATOS.md 9.1, aguardando decisão* — *2026-10-08: refinamento ponto a ponto em andamento; ponto 1 (portal por empresa, endereço, domínio próprio em autoatendimento) FECHADO; ponto 2 (canais, abertura por WhatsApp, LGPD e termos) FECHADO; pontos 3 e 5 (abertura, prioridade ITIL, grupos/N1, diferenciais) FECHADOS; ponto 4 (tipos no portal e catálogo) FECHADO; ponto 6 (perfis e equipes do cliente) FECHADO; ponto 6B (grupos de atendimento e transferência) FECHADO; ponto 7 (matriz de pausa, fechamento, Satisfação como atividade da Etapa 2) FECHADO; ponto 8 (SLA visível ao cliente + atividade Painel e Relatórios de SLA) FECHADO; ponto 9 (telas, KPIs, PWA na Etapa 1) FECHADO; aberto capítulo "App nas lojas" (VISAO 9.9, F12) a pedido do usuário; ordem de execução até o PRD registrada em VISAO seção 5; ponto 10 (segurança e dados) FECHADO; ponto 11: escopo da Etapa 1 em 6 entregas aguardando aprovação final. Nada construído*
- [ ] Modal/página de cliente com gestão de unidades embutida (abas Dados/Unidades)
- [ ] Criação de técnicos via convite por e-mail (inviteUserByEmail)
- [ ] Módulo de SLA + status e prioridades configuráveis por tenant — *atualizado 2026-10-02: SLA e prioridades configuráveis FEITOS (migrations 044–045, "Catálogo e SLA"); falta só status configuráveis por empresa*
- [ ] Aplicar todas as migrations no PRD ao replicar
- [x] Campo "nome fantasia/exibição" no tenant (nome longo cortado na sidebar) — **feito em 2026-09-24** (migration 031, `trade_name`, editável pelo admin)
- [ ] Ajuste de contraste do ícone ATOS na sidebar
- [ ] **Responsividade do painel admin (acabamento pré-PRD, após F5-F7):** — *parcial em 2026-09-25: página não fica mais larga que a tela no celular (`min-w-0` no `<main>`); o resto segue pendente. Esclarecido ao usuário: responsividade do painel NÃO está garantida — o foco mobile garantido é o app do técnico; painel admin é uso principal em desktop até este item ser feito* — sidebar → menu hambúrguer; listagens no mobile com LISTA COMPACTA como padrão (não cards) + busca/filtros fortes, toggle para cards opcional; revisar modais. Aplicar em OS, Clientes, Unidades, Técnicos e Checklists
- [x] **(F10) Policy de `orders`: técnico lê todas as OS da empresa pela API** — restringir às dele (achado 2026-09-25) — **feito em 2026-09-25, migration 042**
- [x] **(F10) Tabelas filhas da OS** (comentários, eventos, evidências, checklists da OS/respostas, relatórios): técnico ainda lê as de OS que não são dele pela API — restringir junto com a revisão OWASP — **feito em 2026-09-25 (migration 043), antecipado da F10: o usuário já tinha autorizado os dois blocos; eu havia perguntado de novo sem necessidade**
  - **Levantamento detalhado 2026-09-25 (pergunta do usuário "quais são os resíduos?")** — mais sério que o descrito antes: (A) LEITURA por empresa em `order_comments`, `order_events`, `order_evidences`, `order_reports`, `fotos_verificacao` e no storage `evidencias` (fotos, assinaturas, PDFs e a listagem dos arquivos); (B) **LEITURA E ESCRITA** (policy ALL por empresa) em `checklist_instances`, `checklist_answers`, `checklist_instance_targets` e **`checklist_answer_history`** — técnico pode concluir/reabrir/excluir checklist de outro, mudar respostas, se atribuir e **apagar a trilha de auditoria da F5**. No DEV hoje: 57 checklists avulsos de outros legíveis/alteráveis pelo técnico; OS de outros sem filhos. Recomendação levada ao usuário: corrigir antes da F7 (ao menos o bloco B; histórico só leitura para todos, gravado só pelo gatilho), com reteste completo do fluxo do técnico — aguardando decisão
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

## 🔚 Estado ao encerrar a sessão de 2026-10-10 (RETOMAR POR AQUI)

**Frente atual: Portal de atendimento — Etapa 1. A E5 (ciclo do chamado) está COMPLETA (E5a, E5b-1 a E5b-4 e E5c, migrations 066 a 071) e o usuário fará o teste de regressão; a próxima é a E6.** E1 (fundação e endereços), E2 (catálogo, grupos, Atendente, filas), E3 (clientes no portal, convites, equipes, pedidos de acesso, LGPD), **E4 (abrir e acompanhar chamado)** e **E5a (conversa e triagem)** estão **concluídas e testadas na URL pública**. Próximas: **E5b** e **E5c** (desenho aprovado em 2026-10-10, ver VISAO_ATOS.md), depois E6. *(Texto anterior: "Próxima: E5 (ciclo do chamado), depois E6".)*

**Migrations da frente do portal (047–071): todas aplicadas no DEV (vgkiddqahubznlzkxfgb); PRD (zeejmwdyqrbjnkhwtdsu) segue pendente — esperado até a promoção do MVP.** Tabela na seção 6; checklist do PRD acima ("001–071").

**Pasta `e2e/` (nova):** roteiros Playwright e de banco usados nos testes, com README (arquivos que precisam existir no scratchpad: `.tk`, `.anon`, `.srk`, `.cred.json`, `foto1.png`, `foto2.png`). Sem segredos reais. Rodam contra a URL pública, nunca `npm run dev`. Também: `supabase/tests/seguranca_isolamento.sql`, `grupos_atendimento.sql` (41), `portal_chamados.sql` (71).

**Teste que envelheceu (não é falha do app):** com o anti-robô real ativo (`TURNSTILE_SECRET`), o pedido de acesso público sem token volta 400 — certo. `e3_api`/`e3_ui` precisam enviar o token de teste da Cloudflare (chave secreta de teste `1x0000000000000000000000000000000AA` na função, token `XXXX.DUMMY.TOKEN.XXXX`) e restaurar o segredo real ao fim.

### Pendências abertas ao fechar a sessão de 2026-10-10
**Lista final de retomada (atualizada no encerramento, em ordem de prioridade):**
- **A.** **Teste de regressão do usuário** da E5 (roteiro na seção "Roteiro de teste manual da E5") e a **confirmação das decisões** da E5 (seção "E5b partes 2 a 4 e E5c"). Atenção ao **e-mail real** (lembrete, pausa, não resolvido, visita não realizada) e à **posição** do "Cliente ausente" no celular.
- **B.** **E6** (próxima construção): painel do Supervisor (com os prazos conforme a transparência), acréscimos no painel F7 (canal, % reclassificados, resolução no N1, transferências, visitas improdutivas, reaberturas, filtro por grupo), PWA instalável, auditoria e regressão completa. Pode incluir trocar a tela antiga "prévia" da equipe no endereço do portal por um aviso com link para a página "Portal do cliente".
- **C.** **Backlog novo desta sessão:** **Orçamento como opção da OS** (todo Incidente/Requisição; integrar ou reaproveitar o sistema do usuário — perguntas abertas na seção 7); lembretes por WhatsApp e "técnico a caminho" (dependem das Conexões de WhatsApp); KPI de visitas improdutivas e tempo em pausa por motivo (painel F7/Etapa 2); alerta de SLA por grupo e por pessoa (decisão de 2026-10-10: destinatários configuráveis por grupo — **ainda não construído**, hoje vale a regra antiga: admins/gestores + coordenadores do grupo); relatório semanal/mensal de SLA e Satisfação (Etapa 2).
- **D.** Itens 1 a 8 abaixo continuam valendo (validar E2–E4, antirrobô e e-mail reais, ordem até o PRD, pontos de desenho, pré-PRD e fim do MVP). **Resíduos de teste atuais:** OS-0192 e OS-0193 ("E4IN…"), OS-0030 e usuários `e2ui.*` — limpar só no fim do desenvolvimento.
- **E.** Ambiente: credenciais de DEV em `~/.atos-credenciais` (ver `restaurar.sh`); testes com antirrobô via `e2e/com_antirobo_de_teste.sh`.

1. **Usuário validar E2, E3 e E4** e confirmar as decisões listadas em cada seção (E2: decisões 1–5; E3; E4: decisões 1–5, além das regras de limite — 10 chamados/hora por pessoa, 5 arquivos ≤10 MB, áudio ≤120 s, "também me afeta" ainda não eleva a prioridade, avisos de e-mail só para aberto/agendado/em atendimento/resolvido/cancelado, termos de uso e privacidade obrigatórios para abrir chamado, WhatsApp automático mostrado como indisponível).
2. **Anti-robô no navegador real:** a Cloudflare bloqueia clique automático; o usuário precisa concluir o widget uma vez no teste E2E (servidor já provado: sem token → 400, token falso → 400, token de teste válido → aceito). Testar também **e-mail real** (convite, aviso de chamado, pedido de acesso) — os testes usaram só domínios reservados.
3. **(CONCLUÍDO em 2026-10-10 — texto original mantido)** **E5 — ciclo do chamado:** Responder ao cliente / Nota interna; confirmação e reclassificação pelo N1 com motivo; matriz de pausa e "Aguardando você" com retomada; Resolvido → Fechado com reabrir e novo chamado ligado; assinatura como confirmação; níveis de transparência; prazo explicado; confirmação da data pedida pelo cliente.
4. **E6 (PRÓXIMA):** painel do Supervisor, acréscimos no painel F7, PWA, auditoria, regressão completa.
5. **Ordem até o PRD (mantida):** escalas + notificação diária → Conexões de WhatsApp (item 3, antes da F8) → F8 planos/pagamento → painel do Super Admin → segurança essencial + responsividade → limpeza de dados de teste + troca de credenciais → PRD. Depois do PRD: Portal Etapas 2–3, F12 (app nas lojas), F9 (GLPI), F10 completa, F11 (manual).
6. **Pontos abertos de desenho:** domínio próprio da gestão/técnicos (hoje o mesmo host da plataforma); botão de remover endereço do portal e limpeza de endereços antigos após 90 dias; varredura no servidor de anexos órfãos do `portal-anexos`.
7. **Antes do PRD:** limites de domínios e uso comercial do plano Vercel (Hobby); URL do DEV escrita nos gatilhos das migrations 030 e 062; migrations 001–071 e republicação das Edge Functions (`portal-endereco`, `portal-acesso`, `portal-avisos`, `criar-tecnico`, `geocodificar`, `enviar-relatorio`, `gerar-relatorio-os`); segredos `TURNSTILE_SECRET` e `SITE_URL`.
8. **Só no FIM do MVP:** limpar dados de teste (OS-0018 em diante, grupos Central N1 / Redes N2 / Campo Interior, usuários `atendente.teste` e `portal.teste`, resíduos de e-mails `e3.*`/`e4.*`) e **trocar credenciais**: token do Supabase, `cfut_` da Cloudflare, `vcp_` da Vercel, segredo do Turnstile, senhas de teste, PAT do GitHub, senha do Zoho, chave do LocationIQ.

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
  em hora (minuto 7) — **confirmado em produção DEV: 1ª execução automática às 14:07 de
  2026-09-25, `succeeded`, idempotente (nenhuma ocorrência duplicada)**
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

### Listas com paginação e filtros no servidor (2026-09-25) — CONCLUÍDO
**Atualização 2026-09-25 (mesma data): proposta aprovada pelo usuário ("ok") e entregue nas 3 etapas (avulsos → OS → app do técnico), testada na URL pública — ver "Entrega e testes" abaixo. Título anterior: "levantado pelo usuário em 2026-09-25, aguardando decisão".**
- **Pergunta do usuário**: a tela de checklists avulsos foi pensada para
  paginação/filtro? Resposta honesta: **não**. Ela carrega TODAS as
  ocorrências de uma vez, filtra só por situação (chips) e não tem busca.
  Com a recorrência o volume cresce rápido (uma série diária = ~365
  ocorrências/ano). Falha minha não ter tratado junto com a recorrência
- **Achado ao conferir o resto**: é o mesmo em **Ordens de Serviço**
  (lista inteira + busca/chips no navegador), no app do técnico
  (**Meus atendimentos** e **Checklists**, inclusive concluídos de
  sempre) e em Técnicos/Checklists (modelos, volume baixo). Só Clientes
  e Unidades paginam no servidor (`usePaginatedQuery`). **Risco
  concreto**: o Supabase devolve no máximo 1.000 linhas por consulta —
  passando disso, a lista corta **em silêncio** (itens somem sem aviso)
- Proposta (filtros, paginação no servidor, estado na URL, padrão único
  para OS/avulsos/app do técnico) levada ao usuário — ver resposta da
  sessão; aguardando decisão

**Entrega e testes (2026-09-25):**
- Componentes reutilizáveis: `FiltrosLista` (botão "Filtros (n)",
  painel, etiquetas com "x", "Limpar filtros"; período opcional com
  rótulo próprio), `useFiltrosUrl` (filtros e página no endereço —
  voltar/recarregar/compartilhar mantêm a lista), `src/lib/periodo.ts`
  (Hoje, Esta semana seg–dom, Este mês, Mês passado, Personalizado, no
  fuso da empresa); `DataListView` ganhou clique na linha (opcional)
- **Checklists avulsos** (migration 040, `listar_checklists_avulsos`):
  página + total + contagens numa chamada, regra de situação no banco;
  abre em **"Em aberto"** (atrasados + hoje + próximos 7 dias, atrasados
  primeiro); chips com contagem (Em aberto, Atrasados, Hoje, Próximos,
  Em andamento, Concluídos, Todos); filtros Período, Cliente, Unidade
  (acompanha o cliente), Técnico, Modelo, Recorrência; busca no título;
  25 por página; aba Recorrências com **"Ver checklists"** (lista já
  filtrada pela série) e "Próxima" por `proximas_das_series()`
- **Ordens de Serviço** (migration 041, `listar_os`): chips com contagem
  (Todas, Em aberto, Aberta, Agendada, Em andamento, Pausada, Concluída,
  Cancelada); filtros "Aberta em" (período da abertura), Cliente,
  Unidade, Técnico (inclui "Sem técnico"), Prioridade; busca em número,
  título, cliente e técnico; mais recentes primeiro; clique na linha
  abre a OS. Mantido o padrão atual de abrir em **"Todas"** (mudar para
  "Em aberto" não estava no aprovado — perguntado ao usuário).
  `useOrders` virou só ações (criar/editar/status/excluir); a edição
  passa a ler o técnico anterior do banco para registrar a transferência
- **App do técnico**: em aberto vêm completos; **concluídos (e
  canceladas, em Atendimentos) só dos últimos 30 dias**, com aviso e
  "Ver mais antigos/antigas" (+30 dias por toque; o botão some quando
  não há mais)
- Testado ponta a ponta (URL pública, 0 erros de console), com massa de
  60 checklists "Teste Volume" no DEV: chips Em aberto (30), Atrasados
  (19), Hoje (3), Próximos (37), Em andamento (8), Concluídos (6), Todos
  (65); página 2 "Mostrando 26–30 de 30" com `?pag=2`; busca "Volume 5"
  = 11; técnico = só os dele; cliente Atakarejo = 20; + período Hoje = 1;
  recarregar e voltar mantêm filtros; limpar volta ao padrão; "Ver
  checklists" da série. OS: 17 (Em aberto 7, Concluídas 9, conferidas
  no banco), 10 por página → página 2 começa na OS-0008 (conferido no
  banco), busca "0018", Concluída + Urgente = 0, "Aberta em: Este mês" =
  7 (conferido), clique na linha abre a OS e voltar mantém filtros,
  edição de técnico registra "transferred" com o técnico anterior e a
  lista recarrega (OS-0024 de teste restaurada). Técnico: OS-0003 (98
  dias) e OS-0006 (70 dias) fora dos 30 dias; 60 dias → OS-0006 ainda
  fora; 90 → entra; 120 → OS-0003 entra e o botão some; checklist
  concluído há 45 dias só aparece depois de "Ver mais antigos". Celular
  sem rolagem horizontal nas duas listas (393 px)
- **Atualização 2026-09-25: achado abaixo CORRIGIDO (autorizado pelo
  usuário — "Ajuste"), migration 042**: `orders_select` agora limita o
  técnico às OS atribuídas a ele (admin/gestor/Super Admin inalterados).
  Conferido por impersonação (técnico 16 próprias / 0 de outros; admin
  17) e na URL pública (app do técnico lista e abre as dele com linha do
  tempo e relatório; admin segue com 17). Junto, ajuste pequeno: abrir
  pela URL uma OS de outro técnico mostrava "Cannot coerce the result to
  a single JSON object" → agora "Ordem de serviço não encontrada ou não
  atribuída a você." **Resta para a F10**: tabelas filhas da OS
  (`order_comments`, `order_events`, `order_evidences`, checklists da OS
  e respostas, `order_reports`) ainda liberam leitura por empresa — o
  técnico lê pela API dados de OS que não são dele. Texto original:
- **Achado de segurança (para a F10, não alterado agora)**: a policy de
  `orders` deixa o **técnico ler todas as OS da empresa** pelo banco
  (não só as dele) — conferido por impersonação (17 de 17). A tela do
  técnico filtra, mas a API não. Vem da F3
- Dados de teste no DEV: 60 checklists "Teste Volume N" e "Teste
  Concluído Antigo" (além dos da recorrência) — apagar após a validação

### Segurança — técnico só acessa dados das próprias OS/checklists (2026-09-25, migration 043)
- Corrige os blocos A (leitura) e B (leitura e escrita) do levantamento
  acima. Funções SECURITY DEFINER `pode_ver_os`, `pode_ver_checklist` e
  `pode_acessar_arquivo(caminho, escrita)` (pelo padrão do caminho no
  bucket: `os/{OS}`, `checklist/{checklist}`, `assinaturas/{OS}`,
  `assinaturas/tecnicos/{usuário}`, `relatorios/{OS}`, `logo.png`)
- Admin/gestor/Super Admin: empresa inteira (inalterado). Técnico: só
  OS atribuídas a ele, checklists dessas OS e avulsos em que está
  atribuído, e os arquivos correspondentes + logo (leitura) + a própria
  assinatura de perfil. **Histórico de respostas: só leitura para
  todos** (grava só o gatilho). Atribuições, criação e exclusão de
  checklists: só admin/gestor. Logo: gravação só admin/gestor. Inclusão
  de comentário/evento/evidência/verificação só em OS/arquivo que a
  pessoa pode ver
- Ajuste de tela junto: botão "Remover" do checklist da OS só para
  admin/gestor (o técnico via o botão, que agora falharia)
- Rollback das policies antigas guardado antes de aplicar (fora do git)
- Testado: bateria por impersonação (técnico vê 9 avulsos dele — antes
  57 de outros; não conclui/altera checklist de outro, não se atribui,
  não apaga histórico, não comenta nem registra evento em OS de outro;
  atualiza e responde os próprios; arquivos: própria OS/checklist/
  relatório/assinatura sim, de outro e de outra empresa não, logo lê
  mas não grava; admin: tudo, e nem ele apaga histórico). Fluxo completo
  na URL pública com câmera simulada, técnico real em OS de teste
  (OS-0025): evidência pela câmera (foto + miniatura + código de
  verificação), miniatura e "Foto autenticada" no visualizador,
  comentário, checklist da OS com Sim + foto do item (arquivo em
  `checklist/{id}`), conclusão do checklist, conclusão da OS com
  assinatura do cliente e do responsável, relatório PDF gerado no
  servidor e baixado pelo técnico; técnico não vê "Remover"; aba
  Checklists do técnico só com os dele. Admin: relatório, assinaturas e
  foto do checklist da OS do técnico, 66 avulsos, logo em
  Configurações. 0 erros de console
- Dados de teste: OS-0025 "Teste Segurança 043" (concluída, com PDF)

### SLA no padrão ITSM — etapas A e B (2026-09-28) — CONCLUÍDAS
Desenho e decisões: VISAO_ATOS.md "SLA no padrão ITSM". Etapa C (alertas
de em risco/vencido) é a próxima; depois F7.
- **Migration 044**: `tenants.sla_risco_pct/prioridade_modo/
  prioridade_matriz/sla_por_cliente`; `os_categorias` (2 níveis, catálogo
  da própria empresa, impacto/urgência sugeridos); `motivos_pausa` (4
  iniciais editáveis; "para o relógio" sim/não); `sla_politicas` (nível ×
  cliente × categoria, horário de atendimento, resposta opcional,
  atendimento, solução em minutos úteis); `orders.tipo/categoria_id/
  impacto/urgencia/pause_motivo_id/agendado_pelo_cliente` + prazos
  gravados (`prazo_*`, `risco_*`, `respondido_em`, `atendido_em` = 1º
  início — `started_at` é sobrescrito ao retomar, `sla_pausa_min`,
  `sla_*_ok`). Gatilho `fn_orders_sla` calcula nível (matriz/escolha
  direta; Preventiva/Requisição/Visita pelo tipo), política (cliente +
  categoria → cliente → categoria → nível; categoria-mãe vale para
  subcategoria), prazos em horas úteis (Calendários, feriados da cidade
  da unidade), pausas que param o relógio (soma minutos úteis ao
  retomar), agendamento a pedido do cliente (data vira o prazo de
  atendimento; solução mantém a folga) e resultado ao concluir.
  Compatibilidade: urgente/alta/normal → crítico/alto/baixo (dados e
  telas antigas). `sla_situacao()`, `previa_sla()`,
  `salvar_config_prioridade()`; `listar_os` com tipo, categoria, filtro e
  contagens de SLA e "Em aberto" ordenada pelo vencimento
- Telas: menu **Catálogo e SLA** (admin/gestor) — Categorias ·
  Prioridades (matriz editável, modo, % de risco) · SLA (metas por nível,
  "Começar com valores sugeridos", exceções por cliente/categoria,
  prévia "se abrisse agora") · Motivos de pausa. OS: bloco
  **Classificação** (tipo, categoria que sugere impacto/urgência,
  prioridade calculada e prazos previstos); lista abre em **"Em aberto"
  por vencimento**, coluna/filtro de SLA, filtros tipo/categoria;
  detalhe (admin e técnico) com **cartão de SLA**; pausar exige motivo
  da lista (+ observação); agendar tem "a pedido do cliente"; app do
  técnico ordena pelo vencimento com "vence em…"; **relatório PDF** com
  Tipo, Categoria e SLA (função `gerar-relatorio-os` v10 publicada pela
  CLI, verify_jwt mantido)
- Lógica validada no PGlite (matriz, níveis por tipo, exceções,
  pausas, agendamento combinado, conclusão, modo simples) antes de
  aplicar
- Testado ponta a ponta (URL pública, admin e técnico reais, 0 erros):
  categorias CFTV › Câmera sem imagem e Rede, duplicado barrado; metas
  sugeridas (Crítico 1/4/8 h …); exceção Atakarejo Alto 2/4 h; prévias
  conferidas à mão (Baixo às 08:29 de seg → atendimento ter 14:29,
  solução sex 08:29). OS pela tela: Crítico pela categoria (4 h/8 h e
  resposta), Visita sem SLA, exceção do cliente (2 h/4 h), Requisição
  (24 h/48 h úteis); lista com "No prazo · vence em 3 h 59 min" e
  ordenada por vencimento; agendado a pedido do cliente → prazo =
  data combinada. Técnico: lista ordenada pelo vencimento, iniciar
  registra atendimento, pausar sem motivo barrado, "Aguardando o
  cliente" para o relógio ("SLA pausado"), retomar somou os minutos
  ÚTEIS da pausa (pausa desde 07:35 → 35 min, expediente começa 08:00)
  e empurrou a solução; linha do tempo com motivo + observação;
  conclusão com assinaturas → "SLA cumprido"; PDF com "Prioridade
  Crítico · Tipo Incidente · Categoria CFTV › Câmera sem imagem · SLA
  Cumprido". Segurança: técnico lê catálogo/metas/motivos mas não
  altera; empresas isoladas. Regressão: edição de OS com transferência
- Achados no teste e corrigidos: prévia da tela de SLA não atualizava
  depois de criar metas; dica "sem impacto/urgência fica Baixo"
  enganosa em OS antigas; botão "Nova exceção" quebrando linha
- Dados de teste: OS-0026 a OS-0029 ("Teste SLA …"); categorias CFTV,
  Câmera sem imagem, Rede; metas sugeridas e exceção Atakarejo

### SLA — etapa C: alertas (2026-09-28) — CONCLUÍDA
- **Migration 045**: `orders.sla_alerta_risco_em/sla_alerta_vencido_em`
  (um aviso por situação) + gatilho que zera quando os prazos mudam
  (pausa, agendamento, reclassificação → pode alertar de novo);
  tabela `notificacoes` (por pessoa; leitura só da própria; escrita só
  pelas funções), `marcar_notificacoes_lidas()`, `verificar_alertas_sla()`
  (só servidor) — avisa admin e gestor ativos da empresa quando a OS
  fica "em risco" e quando vence (texto: "OS-0028 — SLA vencido ·
  título · cliente · atendimento venceu 28/09 às 08:44"); job
  **`atos-alertas-sla` a cada 5 min**; `notificacoes` na publicação de
  tempo real
- Tela: **sino no menu** (admin/gestor) com contador de não lidos, painel
  com os avisos (ícone por tipo, "há 3 min"), tocar abre a OS e marca
  lido, "Marcar todos como lidos"; no celular, ponto vermelho no botão
  do menu. Técnico não tem sino
- Testado: no banco — em risco gera 1 aviso, rodar de novo não duplica,
  vencido gera o segundo; na URL pública — contador 2, aviso novo
  chegou **sem recarregar** (3), painel, tocar abriu a OS e baixou para
  2, marcar todos zerou, ponto vermelho no celular, técnico sem sino, 0
  erros. Job automático executando (cron.job_run_details)
- Ainda não: aviso por WhatsApp/e-mail (vem com a notificação diária)

### F7 — Painel gerencial (2026-10-01/02) — CONCLUÍDA · **VALIDADA pelo usuário em 2026-10-02**
Desenho e KPIs aprovados pelo usuário em 2026-09-25 (VISAO_ATOS.md "KPIs do
painel"). O painel fica no Dashboard (`/`) e é só para **admin/gestor**. O
técnico continua com o app de campo, que já basta, e o Super Admin vê um
aviso.
- **Migration 046**:
  - `tenants.sla_meta_pct` (padrão 90, de 50 a 100) + `definir_meta_sla()`
  - `orders.tempo_atendimento_min` / `tempo_solucao_min` são calculados
    pelo gatilho `trg_orders_tempos` e **gravados na conclusão**; reabrir
    a OS limpa os valores. O painel não recalcula horas úteis.
  - Backfill das OS concluídas feito com `handle_orders_updated_at`
    desligado; o hash de `updated_at` foi conferido, sem mudança.
  - `fn_primeira_visita(uuid)`, `painel_desempenho()`
  - `painel_gerencial(p)`: uma chamada devolve o painel inteiro e
    respeita os filtros de período, cliente, técnico e categoria.
  - `listar_os` com prioridade em lista (`critico,alto`)
- **Migration 047**: `listar_os` aceita `periodo_por = 'conclusao'`.
  - Achado na revisão final contra o desenho aprovado ("tudo clicável até
    a lista"): os indicadores do período contam pela **data de
    conclusão**, mas a lista só filtrava pela abertura. O link mostraria
    outra quantidade (ex.: setembro, 8 no painel × 9 na lista).
  - Agora os links "Ver concluídas" e "Ver N fora do prazo" abrem a lista
    com o chip **"Concluída em"**.
- **Definições dos KPIs**:
  - **Tempo médio até o atendimento** = abertura → 1º início, em horas
    úteis.
  - **Tempo médio de solução** = abertura → conclusão, em horas úteis,
    menos as pausas que param o relógio.
  - **% SLA cumprido** = OS concluídas com SLA cujos prazos (resposta,
    atendimento e solução) foram todos cumpridos. O selo vem com ícone e
    texto: "Na meta", "Abaixo da meta" (até 10 p.p. abaixo) ou "Longe da
    meta".
  - **Resolução na 1ª visita** = incidente concluído que não foi reaberto
    e sem nova OS da mesma unidade e categoria em 30 dias.
  - **Comparação** com o período anterior de mesmo tamanho: p.p. para
    percentuais, % para quantidades e tempos. Em tempo, menor é melhor.
- **Seções**:
  - **Agora** (cartões que levam à lista filtrada): SLA vencido, em risco,
    sem técnico, Crítico/Alto em aberto, preventivas atrasadas.
  - **Desempenho**: 5 KPIs.
  - **Evolução**: por dia, ou por semana quando o período passa de 31
    dias.
  - **Idade do backlog**: até 2 dias / 3–7 / 8–15 / mais de 15.
  - **Equipe**: carga, concluídas, SLA e tempo; marca "sobrecarregado"
    com 3 ou mais OS em aberto e 50% acima da média.
  - **Clientes**: top 10 com volume, % SLA e unidades reincidentes.
  - **Reincidência**: unidades com 2 ou mais incidentes no período.
  - **Preventivas**: checklists previstos no prazo/atrasados e a proporção
    preventiva × corretiva.
  - **Comprovação**: % com foto, assinatura e relatório enviado.
- **Gráfico de evolução** (regras de visualização de dados):
  - **Dois gráficos empilhados** com o mesmo eixo de datas, em vez de um
    gráfico de dois eixos. Barras: abertas × concluídas. Linha: % SLA com
    a meta tracejada.
  - Paleta validada no fundo escuro do cartão: azul #3987e5 e laranja
    #d95926.
  - Cores de status (verde, âmbar, vermelho) sempre com ícone e texto.
  - Dica ao passar o mouse ou tocar, e "Ver em tabela".
- **Meta de SLA** editável pela empresa em *Catálogo e SLA › Prioridades*.
- **Ajustes encontrados e corrigidos nos testes**:
  - grades do painel estouravam a largura no celular (`min-w-0` nos
    itens);
  - rótulos do gráfico colidiam (data × título do 2º gráfico, rótulo da
    meta);
  - o selo "Na meta" quebrava a linha;
  - `fn_primeira_visita` recebia a linha inteira, com erro de tipo;
    passou a receber o id;
  - o backfill alteraria `updated_at` (evitado).
- **Testado na URL pública** (admin, celular 393px e Super Admin):
  - os valores do "Agora" bateram com o RPC;
  - os KPIs bateram com o banco: setembro com 8 concluídas e "Ver
    concluídas" listou as mesmas 8; outubro com 1 OS violada, link "Ver 1
    fora do prazo" → lista com 1;
  - drill-downs: Crítico/Alto → `pri=critico,alto`; SLA vencido →
    OS-0028/0029;
  - filtro por técnico; dica e tabela de 30 linhas;
  - meta alterada para 85, refletida no painel e devolvida para 90;
  - 0 erros no console.
- Massa de teste nova: **OS-0030** ("Teste F7 SLA violado", concluída
  fora do prazo), que entra na limpeza do fim do desenvolvimento.

### 🔴→✅ Segurança — escalada de privilégio pelo cadastro público (2026-10-09, migration 048)
Achado ao preparar a E1 do portal (usuários externos vão entrar no sistema).
- **Problema 1:** o gatilho `handle_new_user` (migration 001) copiava o **perfil** (`role`) dos metadados que o próprio usuário escolhe no cadastro.
- **Problema 2:** o **cadastro público estava ligado** no Auth (`disable_signup = false`).
- **Risco somado:** qualquer pessoa, só com a chave pública que está no front, poderia chamar `signUp` com `role: super_admin`, confirmar o próprio e-mail e virar **Super Admin**.
- **Sem sinal de exploração:** os usuários com poder são só os esperados (adm@vluma, admin@novadata, adm@infoxtec). Há 2 técnicos sem empresa, de junho (sdoreaestudo*@gmail.com, contas de teste), que entram na limpeza do fim do desenvolvimento.
- **Correção (ajuste pequeno de segurança, sem impacto funcional, feito e relatado):**
  1. **Migration 048:** o perfil nasce sempre "tecnico" sem empresa (perfil e empresa continuam definidos pela função `criar-tecnico`, no servidor). Contas do portal (`app_metadata.tipo = 'portal'`, gravável só pelo servidor) **não** viram usuários internos, como preparo da E1.
  2. **Auth (Management API):**
     - `disable_signup = true`;
     - `site_url` passou de `http://localhost:3000` para `https://atosdev.vercel.app`;
     - `uri_allow_list = https://atosdev.vercel.app/**`.

     Com o `site_url` antigo, os links de "esqueci minha senha" caíam no localhost. Era um achado escondido.
- **Testado:**
  - um cadastro feito antes da propagação da configuração já nasceu "tecnico" sem empresa (a 048 funcionou), e foi apagado;
  - depois da propagação, o cadastro público foi recusado com `signup_disabled`;
  - regressão: `criar-tecnico` com o admin da Infoxtec criou o técnico com a empresa certa (conta de teste apagada em seguida).

### 🔴→✅ Segurança — regras de escrita sem checagem de empresa (2026-10-09, migration 049)
Varredura das regras de escrita (UPDATE/INSERT/DELETE) logo depois da 048.
- **Problemas encontrados:**
  - `users_admin_update`/`users_admin_insert` (migration 002) só checavam o papel: um **admin podia virar super_admin** mudando o próprio perfil, ou **trocar a própria empresa** e entrar em outra como admin;
  - `order_comments_update`/`order_evidences_update`: o autor podia **mover o próprio comentário/evidência para uma OS de outra empresa**.
- **Correção:**
  - users: admin escreve só na própria empresa; gestor edita só técnicos da própria empresa (a tela Técnicos já era liberada ao gestor e a edição falhava — falha latente corrigida junto);
  - gatilho `trg_users_protege` impede trocar a empresa, mudar o próprio perfil e promover a super_admin (só o Super Admin ou o servidor podem);
  - comentários e evidências exigem que a OS de destino seja visível (`pode_ver_os`).
- **Testado por personificação** (com o desfazer no fim):
  - admin mudando o próprio perfil → bloqueado;
  - admin trocando a própria empresa → bloqueado;
  - admin editando um técnico → OK;
  - admin promovendo técnico a super_admin → bloqueado;
  - admin mudando técnico para gestor → OK;
  - técnico mudando o próprio perfil → 0 linhas;
  - admin inserindo usuário em outra empresa → bloqueado;
  - técnico movendo o próprio comentário para uma OS de outra empresa → bloqueado;
  - preferências do técnico (`atualizar_minhas_preferencias`) → OK.

### 🔴→✅ Segurança — funções internas expostas (2026-10-09, migration 050)
- **Varredura** das funções que rodam com privilégio do dono (SECURITY DEFINER) e que qualquer usuário logado podia chamar. Três não tinham checagem de empresa ou papel:
  - `sla_politica_para` devolvia a política de SLA de **qualquer** empresa;
  - `fn_motivos_pausa_padrao` semeava motivos em **qualquer** empresa;
  - `fn_os_tempos_uteis` (cálculo interno).
- **Correção:** a execução foi retirada dos usuários; as funções continuam disponíveis para os gatilhos e as funções que as usam por dentro.
- **Testado:**
  - `previa_sla` OK;
  - `painel_gerencial` OK;
  - inserir OS calcula o prazo de SLA (gatilho) OK;
  - chamada direta a `sla_politica_para` → "permission denied".

### 🔴→✅ Segurança — "sem perfil" passava pelas guardas das funções (2026-10-09, migration 053)
- **Achado pelo roteiro automático de segurança da E1:** cerca de 35 funções se protegem com `if get_meu_role() <> 'admin' then raise` (ou `not in`). Para quem **não tem perfil interno** (as pessoas do portal, por desenho), o papel era NULL, e a comparação com NULL não dispara o IF: **a guarda deixava passar**.
  - Exemplos: trocar a chave de geocodificação da plataforma, a identidade legal de qualquer empresa ou habilitar o portal de qualquer empresa.
  - Só pessoas do portal poderiam explorar. Elas não existiam antes da E1; no DEV, só a pessoa de teste.
- **Correção na raiz:** `get_meu_role()` devolve `'nenhum'` para quem não tem perfil interno.
  - As regras de tabela já eram seguras: toda comparação negativa vem junto com `tenant_id = get_meu_tenant()`, que é nulo para essas pessoas.
  - Também os **feriados da plataforma** deixaram de ser legíveis por visitante anônimo e por pessoas do portal.
- **Testado:**
  - roteiro automático com **0 falhas**;
  - o roteiro **detectou** uma regra de vazamento e uma função sem guarda plantadas de propósito (desfeitas no fim);
  - regressão: admin com papel "admin" e painel OK; técnico com papel "tecnico" e as 22 OS dele;
  - funções chamadas pelo servidor (`ler_senha_smtp`, `registrar_uso_geocodificacao`, jobs) não dependem de papel.

### 🔴→✅ ERRO MEU, GRAVE — o ATOS foi confundido com um portal de cliente (2026-10-09, corrigido no mesmo dia)
- **O que aconteceu:** o endereço de teste correto do ATOS é **https://atosdev.vluma.com.br** (o usuário já o havia informado). Na E1 eu escrevi o código achando que o ATOS rodava só em `atosdev.vercel.app` e tratei **qualquer outro endereço como portal de cliente**. Resultado: em `atosdev.vluma.com.br`, o login da gestão e dos técnicos mostrava "Portal não encontrado".
- **Por que não vi:** meus testes rodavam em `atosdev.vercel.app`, que estava na minha lista. Rodei nos dois endereços só depois do alerta do usuário.
- **Correção (commit c68f6ea):**
  - `tipoDoHost()` → 'painel' (endereços conhecidos do ATOS), 'portal' (`atendimento.*`) ou 'desconhecido';
  - endereço desconhecido é conferido no banco (`portal_resolver`), e só vira portal se estiver cadastrado como portal (domínio próprio);
  - qualquer outro caso é o ATOS, e **o ATOS não fica mais "preso" por um endereço novo**;
  - endereços extras do ATOS via `VITE_PAINEL_HOSTS`;
  - Auth: `site_url` passou de `atosdev.vercel.app` para **`atosdev.vluma.com.br`** (os e-mails de "esqueci minha senha" apontam para ele).
- **Testado em atosdev.vluma.com.br:** login do ATOS, admin no painel, técnico no celular no app de campo, Super Admin e o caminho interno do portal. Mais as 35 verificações da E1: **TUDO OK**.
- **Regra a partir de agora:** TESTE = **https://atosdev.vluma.com.br** (e `atosdev.vercel.app` como segundo endereço). Mudança que mexe em roteamento, endereço ou login é testada nos dois.
- **Estrutura oficial de endereços (Super Admin, clientes ATOS e portal, PRD e HML) registrada em VISAO_ATOS.md 9.1 em 2026-10-09.**
- **Pendente de decisão do usuário:** o caminho `/portal/<nome>` fica só como prévia da equipe interna (combinado no ponto 1: "só interno: teste e contingência"). Hoje ele ainda aceita a entrada de clientes, e a restrição será feita junto do subdomínio automático.

### Cloudflare — acesso validado e DNS atual da zona (2026-10-09)
- Token válido (`/user/tokens/verify` = ativo). **Zone ID de vluma.com.br: `56085f864e0c103590c760bdff42d014`** (descoberto pela API; o ID da zona não é secreto).
- **Estado do DNS (só leitura):**
  - o `atosdev.vluma.com.br` é um CNAME (somente DNS, sem o proxy laranja) para `9b2821f907a6be06.vercel-dns-017.com`, que é o alvo do projeto atosdev na Vercel;
  - não existe nenhum registro `atendimento*` nem curinga (`*.vluma.com.br`), então não há conflito;
  - e-mail em Zoho (MX/SPF) e Brevo (DKIM): **não serão tocados**;
  - já existe `evo.vluma.com.br` (servidor da Evolution, 31.97.86.173) — útil quando chegarmos às Conexões de WhatsApp.
- **Como o portal vai usar:** por empresa, um CNAME `atendimento.<empresa>` (e `atendimento.<empresa>.dev` no HML) **somente DNS**, para o alvo da Vercel do projeto + o domínio cadastrado no projeto da Vercel por API (certificado automático). O mesmo padrão já usado nos outros subdomínios da zona.

### Vercel — plano atual (2026-10-09)
- O projeto atosdev está no time **"VLUMA's projects" (vlumas-projects-48debc88), plano Hobby**.
- **Antes da produção/F8:** conferir (a) o **limite de domínios por projeto** do Hobby, já que cada empresa com portal ativo ocupa um endereço (`atendimento.<empresa>…`) e cada domínio próprio, outro; (b) os termos de **uso comercial** do plano Hobby (o produto será vendido). Se o limite ou os termos não servirem, o plano Pro entra na conta de custos da F8.
- O token da Vercel é criado em **Account Settings › Tokens** (não em Team Settings).

### Portal de atendimento — Etapa 1 · E1 Fundação (2026-10-09) — CONCLUÍDA E TESTADA (inclui o endereço automático)
- **Migration 051 (banco do portal):**
  - **empresa:** `tenants.portal_*` — habilitado (Super Admin), ativo, nome curto, nome, cor, boas-vindas, contatos, termos próprios, versão da logo;
  - `portal_slug_erro` (formato + nomes reservados);
  - `portal_slugs_antigos`: o nome curto trocado redireciona por 90 dias;
  - `portal_plataforma`: domínio base e prefixo do subdomínio;
  - `portal_enderecos`: subdomínio VLUMA / domínio próprio;
  - `portal_pessoas` + `portal_vinculos`: pessoa ↔ cliente, perfil supervisor/usuario, vários portais e vários clientes por pessoa;
  - `termos` versionados (padrão VLUMA v1 de uso, privacidade e comunicação, com `{{empresa}}`) + `termos_aceites` (versão, data, canal, IP, navegador, retirada);
  - `portal_auditoria`;
  - bucket público `portal-publico`, só para a logo;
  - **funções:**
    - públicas: `portal_resolver` (identidade pública por nome curto ou host; prévia para admin/gestor) e `portal_termo_texto`;
    - da pessoa do portal: `portal_meu_contexto`, `portal_aceitar_termos`, `portal_registrar_acesso`;
    - da empresa: `portal_slug_disponivel`, `salvar_portal_config`, `portal_logo_atualizada`, `publicar_termo`;
    - da plataforma: `definir_portal_habilitado`, `portal_config_plataforma`, `definir_portal_plataforma`.
  - **Isolamento:** pessoas do portal não estão em `public.users`; as tabelas novas não têm leitura para elas; tudo passa pelas funções `portal_*`.
- **Migration 052:** o Auth grava o `app_metadata.tipo = portal` num UPDATE depois do INSERT, então o gatilho de INSERT (048) não o via e criava a linha interna. O novo gatilho remove essa linha (só se for órfã, sem empresa).
- **Roteiro automático de segurança:** `supabase/tests/seguranca_isolamento.sql` (rodar com `sql.sh` a cada mudança de banco).
  - Anônimo e pessoa do portal não leem nenhuma linha de nenhuma tabela, nem arquivo do storage.
  - Toda função privilegiada executável por usuário tem guarda ou está na lista revisada.
  - Funções do portal sem acesso a outra empresa.
  - Pega também tabelas e funções criadas no futuro.
- **Pessoa de teste do portal:** `portal.teste@example.com` (supervisora do cliente "Cliente Trigger Teste", Infoxtec). A senha está só no scratchpad e entra na limpeza do fim.
- **Migration 054:** o **consentimento de comunicação é opcional** (LGPD: consentimento livre).
  - Termos de uso e aviso de privacidade são obrigatórios.
  - A recusa fica registrada (aceite já retirado) e não é perguntada de novo a cada login, só numa versão nova.
  - `portal_aceitar_termos(tenant, aceitos, recusados)`.
- **Telas:**
  - **Portal** (`src/portal/`):
    - montado na raiz quando o site é aberto por um host de portal, ou em `/portal/<nome>` no domínio do painel;
    - tema na cor da empresa (luminosidade ajustada para o fundo escuro; texto do botão claro ou escuro conforme a cor);
    - Entrar (mensagens claras, aviso de excesso de tentativas);
    - Esqueci minha senha (mesma resposta exista ou não a conta) e Redefinir senha (volta ao portal);
    - Termos públicos (`/termos/uso|privacidade|comunicacao`);
    - Aceite (obrigatórios + comunicação opcional, texto expansível);
    - Início (saudação, boas-vindas, vínculos e perfil, contatos da empresa com WhatsApp; os chamados chegam na E4);
    - "Sem acesso" com contatos;
    - **prévia interna** para a equipe da empresa logada;
    - aviso de prévia com o portal inativo;
    - nome curto antigo redireciona mantendo a página;
    - registro de acesso uma vez por sessão;
    - rodapé "Tecnologia ATOS · VLUMA".
  - **Configurações › Portal de atendimento** (admin):
    - nome curto com conferência ao digitar (formato, reservados, em uso) e aviso de redirecionamento de 90 dias;
    - nome, cor com prévia do botão, boas-vindas (500), contatos (WhatsApp guardado só com dígitos);
    - logo (cópia pública ao salvar pela 1ª vez + "Atualizar logo do portal"; trocar a logo da empresa também atualiza a do portal);
    - termos por tipo (padrão VLUMA × texto próprio, publicar nova versão, ler);
    - ativar e abrir o portal.
  - **Super Admin:**
    - Empresas › "Portal: habilitado/desabilitado";
    - Configurações › "Plataforma — portal de atendimento" (domínio base + prefixo; termos padrão: ler e publicar nova versão).
  - `useAuth` passou a usar `maybeSingle` (pessoa do portal não gera 406 no console).
- **Testes na URL pública:** `portal_e1.mjs`, 35 verificações, **TUDO OK**:
  - Super Admin habilita; nome reservado recusado; configuração salva (WhatsApp só com dígitos); logo publicada;
  - prévia do admin com o portal inativo; botão na cor da empresa; visitante não vê o portal inativo;
  - texto próprio de uso publicado e escolhido; portal ativado;
  - sem sessão → Entrar com boas-vindas; aviso de privacidade público com o nome da empresa; nome inexistente → "Portal não encontrado";
  - no celular: senha errada com mensagem clara; 1º acesso → aceite com o termo PRÓPRIO; "Continuar" bloqueado sem os obrigatórios;
  - recusou a comunicação → Início (saudação, vínculo "Cliente Trigger Teste · Supervisor", WhatsApp `wa.me/5571999990000`), sem rolagem horizontal;
  - aceites gravados (comunicação como recusa, com navegador); acesso na auditoria;
  - 2º login sem novo aceite; pessoa do portal no painel interno → login;
  - troca do nome curto → antigo redireciona mantendo a página → devolvido para "infoxtec";
  - console só com o 400 esperado da senha errada.
  - Roteiro de segurança depois dos testes: 0 falhas.
- **Achados corrigidos nos testes:**
  - o registro de acesso nunca era enviado (a chamada do Supabase só dispara quando o resultado é lido);
  - 406 no console pelo perfil interno inexistente;
  - nome do portal cortado no topo do celular (com logo, o nome aparece só em telas largas);
  - aviso na configuração quando a empresa não tem nome de exibição (o portal mostra a razão social).
- **Endereço automático do portal (concluído em 2026-10-09):**
  - **Edge Function `portal-endereco`** (verify_jwt true), ações `sincronizar`, `verificar` e `remover`. Admin da empresa age na própria empresa; Super Admin informa a empresa; técnico e gestor recebem 403.
  - **O que faz:** monta `<prefixo>.<nome curto>.<domínio base>`, **cadastra o domínio no projeto atosdev da Vercel**, cria o **CNAME somente-DNS na Cloudflare** para o alvo que a própria Vercel indica, e acompanha em `portal_enderecos` (aguardando DNS → verificando o certificado → ativo; "ativo" só quando o HTTPS responde de verdade).
  - **Segurança:** só mexe em nomes no formato `<prefixo>.<slug>.<domínio base>`; **nunca sobrescreve** um registro diferente; só remove registros que ele mesmo criou (comentário "ATOS portal"); os tokens só existem como segredos da função.
  - **Segredos da função** (supabase secrets): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`.
  - **Migration 055:** `portal_resolver` devolve `host_oficial` (endereço ativo e principal) e `interno`.
    - O **cliente só entra pelo endereço oficial**: o caminho `/portal/<nome>` e um endereço antigo (depois de trocar o nome curto) levam ao oficial, mantendo a página.
    - Só a **equipe interna logada** mantém o caminho `/portal/<nome>` como prévia.
    - Enquanto não houver endereço ativo, o caminho interno continua servindo.
  - **Tela (Configurações › Portal de atendimento):** bloco "Endereço do portal para os seus clientes", com a situação por etapa, o botão "Verificar agora" e o acompanhamento automático (a cada 10 s) até ficar ativo; endereços antigos aparecem como "endereço antigo".
  - **DEV:** domínio base `dev.vluma.com.br`. O endereço da Infoxtec é **https://atendimento.infoxtec.dev.vluma.com.br** (ativo, HTTPS).
  - **Auth (Supabase):** links permitidos de recuperação de senha incluem `https://atendimento.*.dev.vluma.com.br/**` e `https://atendimento.*.vluma.com.br/**`.
  - **Testes na URL pública**, `portal_host.mjs` + `portal_troca.mjs` + `portal_e1.mjs`, **TUDO OK**:
    - o endereço do portal abre o portal da Infoxtec e **nunca o painel do ATOS** (`/login` e `/os` voltam ao portal);
    - `atosdev.vluma.com.br` continua sendo o ATOS;
    - o visitante no caminho interno é levado ao endereço oficial na mesma página; o admin mantém a prévia;
    - pessoa do portal no celular entra pelo oficial, sem rolagem horizontal, é levada do caminho interno ao oficial e recusada no painel do ATOS;
    - "esqueci a senha" pelo endereço do portal;
    - **troca do nome curto**: cria o endereço novo (~1 min até o HTTPS), o anterior vira "endereço antigo" e leva ao novo; voltar ao original o devolve como principal; `remover` apaga na Vercel e na Cloudflare;
    - técnico recebe 403; o roteiro de segurança segue com **0 falhas**.
  - **Cloudflare:** a zona passou de 38 para 39 registros (só o CNAME do portal); e-mail, sites e demais registros não foram tocados.
  - **Pendências deste item:**
    - não há botão "remover" na tela (a função existe);
    - endereços antigos continuam servindo e **não são limpos automaticamente** após os 90 dias (limpeza futura);
    - o **domínio próprio** da empresa (adicional pago) usa a mesma tabela e fica para a F8 / Etapa 3.

### 🔴→✅ Segurança — usuário DESATIVADO continuava com acesso (2026-10-09, migration 059)
- **Achado nos testes da tela Usuários (E2):** "desativar" só trocava `users.active`. A conta desativada continuava **entrando e lendo as OS da empresa** — valia também para técnicos desativados pela tela Técnicos (um ex-funcionário manteria o acesso). Era anterior à E2.
- **Correção na raiz:** `get_meu_role()` e `get_meu_tenant()` (base de todas as regras de acesso e funções) tratam usuário inativo como **sem perfil** (papel `nenhum`, sem empresa). O bloqueio é imediato, mesmo com a sessão aberta. As Edge Functions que conferem o perfil (`criar-tecnico`, `geocodificar`, `enviar-relatorio`, `gerar-relatorio-os`, `portal-endereco`) passaram a ignorar usuário inativo.
- **App:** login de conta desativada mostra "Seu acesso está desativado. Fale com o administrador da sua empresa."; sessão aberta é derrubada ao recarregar.
- **Impacto:** nenhum dado real (só a conta de teste e2ui estava inativa). O roteiro de segurança ganhou o item 6 (usuário desativado não lê nada).
- **Testado na URL pública:** a API devolve 0 OS e 0 grupos para o desativado, mensagem de login, sessão derrubada, reativado entra, admin ativo normal.

### Portal de atendimento — Etapa 1 · E2 Catálogo e grupos (2026-10-09) — CONCLUÍDA E TESTADA
Desenho aprovado em 2026-10-08 (VISAO_ATOS.md 9.1, pontos 3, 4, 6B e 7).
- **Migration 056 — perfil Atendente** (`users.role = 'atendente'`): vê todas as OS, abre e edita, classifica, atribui, transfere e conversa. **Não** exclui OS e **não** mexe em cadastros, catálogo, SLA, calendários, grupos, usuários, configurações nem no painel gerencial. Menu só com "Ordens de Serviço"; ao entrar cai na fila **Novos sem grupo**; tem o sino de avisos. As telas de cadastro ficaram fechadas ao Atendente também pelo endereço.
- **Migration 057 — grupos, ficha do catálogo, transferência:**
  - `grupos_atendimento` (nível N1/N2/N3/Campo, **Assumir** desligado por padrão, ativo) e `grupo_membros` (coordenador). `salvar_grupo` (admin/gestor) valida: coordenador só Gestor, Atendente ou Administrador; nome único com mensagem amigável.
  - **Ficha do catálogo** (`os_categorias`): `descricao_portal`, `visivel_portal` (**nulo = ainda não decidido, não aparece**), `tipos_portal`, `grupo_padrao_id` (= "categorias atendidas" do grupo, que se edita nas duas telas).
  - `definir_visibilidade_categorias` (assistente).
  - **OS:** `grupo_id` e `transferencias`. **Roteamento:** a OS nasce no grupo padrão da categoria (ou da categoria-mãe) quando nenhum grupo é informado.
  - **Segurança do técnico preservada:** só vê as próprias OS; a única exceção é a **fila do grupo em que é membro e que liga o Assumir** (OS do grupo sem técnico). Não consegue passar a OS por UPDATE direto.
  - `assumir_os`; `transferir_os`: para grupo e/ou técnico, **motivo obrigatório**, **direção automática pelo nível** (escalonamento/devolução/lateral/encaminhamento/reatribuição), o **SLA não reinicia**, OS em andamento/pausada volta para "aberta", histórico em `os_transferencias`, contador, evento na linha do tempo e **alerta de pingue-pongue** (`tenants.transferencias_limite`, padrão 3; avisa a partir de N transferências).
  - **Alertas de SLA** (em risco e vencido) também para o **coordenador** do grupo da OS (não técnico); novos tipos de aviso "transferida" e "pingue_pongue".
- **Migration 058:** `listar_os` com filtro de grupo, o grupo de cada OS e a contagem de **Novos sem grupo**.
- **Telas:**
  - **Grupos de atendimento** (admin/gestor): lista, cadastro (membros, coordenação, categorias atendidas, Assumir), limite do alerta de transferências.
  - **Catálogo e SLA › Categorias:** ficha "No portal do cliente" (Aparece? Sim/Não **obrigatório e sem pré-marcação** na criação; tipos; descrição para o cliente; grupo padrão) e o **assistente** "O que aparece no portal do cliente?" para as categorias que já existiam (aviso no topo enquanto houver sem decisão).
  - **Ordens de Serviço:** filas "Novos sem grupo (n)" e "Fila: <grupo>", filtro e coluna Grupo, campo "Grupo de atendimento" no formulário.
  - **Detalhe da OS:** grupo, botão **Transferir** (motivo obrigatório, previsão da direção), histórico de transferências com o **tempo em cada grupo**, evento na linha do tempo.
  - **App do técnico:** **"Fila do grupo"** só para membros de grupo com Assumir ligado (os demais não veem nada de novo); "Assumir" na OS da fila; "Transferir" para o técnico responsável.
  - **Usuários** (admin): cria **Atendente** e **Gestor** (a função `criar-tecnico` aceita o perfil; só o administrador cria atendente/gestor), edita e desativa. O Super Admin deixou de ver o item "Usuários" (era um espaço reservado sem função).
  - Sino: avisos de transferência e pingue-pongue.
- **Roteiros automáticos:** `supabase/tests/grupos_atendimento.sql` (41 verificações: roteamento, quem vê a fila, assumir, transferir, pingue-pongue, SLA que não reinicia, direitos do Atendente, alertas ao coordenador) e o de isolamento (0 falhas). O de grupos foi conferido contra um erro plantado e não deixa resíduo.
- **Testado na URL pública** (atosdev.vluma.com.br): administrador (grupos, catálogo, assistente, filas, transferência), Atendente (menu, rotas bloqueadas, sino, fila, encaminhar, editar o grupo), técnico no celular (fila do grupo, assumir, transferir, regressão: as mesmas 22 OS de antes), Usuários, desativação; mais teste de fumaça das 16 telas existentes (admin, Super Admin e técnico) sem erros, e as baterias da E1.
- **Decisões do PO/Engenheiro nesta entrega (a confirmar pelo usuário):**
  1. O coordenador de grupo não pode ser técnico (os alertas chegam pelo sino do painel; o app de campo não tem sino).
  2. O técnico de destino de uma transferência **não recebe aviso** (não há canal): ele vê a OS na lista do app. O aviso virá com a notificação diária / PWA.
  3. Alterar técnico ou grupo pelo **formulário de edição da OS** continua sendo ajuste direto (não conta como transferência e não pede motivo); a transferência auditada é o botão Transferir.
  4. O Atendente não vê Clientes nem Unidades por enquanto.
  5. Transferir "para um técnico" só aceita técnicos (não atendentes).
  6. "Assumir" só vale para OS aberta ou agendada.
  7. Subcategoria só aparecerá no portal se a categoria principal também aparecer (vale na E4).
- **Pendente (já previsto):** roteamento por região e distribuição automática (Etapa 2 do portal); "exige aprovação" na ficha (Etapa 2).
- **Massa de teste do DEV:** grupos "Central N1", "Redes N2" e "Campo Interior" (usados pelo roteiro de SQL), o usuário `atendente.teste@infoxtec.com.br` (senha no scratchpad). Os resíduos dos testes de tela foram apagados. Tudo entra na limpeza do fim do desenvolvimento.

### 🔴→✅ O roteiro de segurança tinha checagens vazias (2026-10-09, corrigido)
- **Achado ao construir a E3:** no `supabase/tests/seguranca_isolamento.sql`, a seção 5 (funções do portal) terminava com um tratador `EXCEPTION`. Em PL/pgSQL, **um tratador desfaz tudo o que o bloco já gravou**: as falhas registradas antes dele eram descartadas em silêncio (a chamada que lança erro de propósito acionava o tratador). Ou seja, as checagens da E1 (e as novas da E3) **nunca poderiam acusar falha**.
- **Correção:** sem tratador no bloco externo; cada chamada que deve falhar tem o seu sub-bloco; os ids dos clientes são calculados antes de trocar de papel (a pessoa do portal não lê a tabela de vínculos); e há uma verificação **positiva** (o Supervisor consegue gerenciar o próprio cliente), que prova que o teste não é vazio.
- **Prova de que agora detecta:** três falhas plantadas (Supervisor lendo outro cliente, pessoa do portal publicando termo, acesso a outra empresa) foram acusadas. Resultado real: 0 falhas.
- **Regra:** todo roteiro novo é validado com uma falha plantada antes de ser aceito (já valia para o de grupos).

### Portal de atendimento — Etapa 1 · E3 Clientes no portal (2026-10-09/10) — CONCLUÍDA E TESTADA
Desenho aprovado em 2026-10-08 (VISAO_ATOS.md 9.1, pontos 2, 6 e 10).
- **Migration 060:**
  - `clients.portal_ativo` (a empresa liga o portal **por cliente**);
  - `portal_equipes` (+ membros e unidades opcionais);
  - `portal_convites` (**só o hash do token** fica no banco; vale 7 dias, uso único);
  - `portal_solicitacoes_acesso`;
  - `notificacoes.link` e o novo tipo "solicitacao_acesso";
  - `portal_papel_no_cliente` (quem consulta é 'interno' = admin/gestor da empresa, 'supervisor' ativo daquele cliente, ou nenhum);
  - funções: `definir_portal_cliente`, `portal_listar_gestao`, `portal_alterar_vinculo`, `portal_salvar_equipe`, `portal_solicitacoes_empresa`, `portal_exportar_pessoa`, `definir_turnstile`;
  - `portal_resolver` devolve a chave pública do anti-robô.
  - Regras:
    - o Supervisor não altera o próprio acesso;
    - o último Supervisor só sai pela empresa;
    - desativar nunca exclui e tira a pessoa das equipes;
    - pessoa anonimizada some da lista e não volta.
- **Edge Function `portal-acesso`** (verify_jwt true; também aceita chamadas públicas):
  - **públicas:** `consultar` (convite), `aceitar` (a pessoa cria a **própria senha**; senha ≥ 8 com letras e números), `solicitar` (pedido de acesso);
  - **autenticadas** (equipe interna ou Supervisor do cliente): `convidar`, `reenviar`, `revogar_convite`, `decidir_solicitacao`;
  - **administrador:** `anonimizar`.
  - **Segurança:**
    - o link do convite **nunca é devolvido a quem convida** (ele poderia criar a conta no lugar da pessoa);
    - e-mail de usuário da equipe interna não vira conta de portal;
    - quem já tem conta em qualquer portal recebe o acesso sem criar senha nova;
    - o "Solicitar acesso" responde sempre igual (não revela e-mails nem clientes), tem limite de 5 pedidos por hora por origem, deduplica e reconhece o nome do cliente sem acento/caixa;
    - e-mail sai com o remetente da empresa (próprio ou "via ATOS") e **nunca para domínios de teste** (example.com, .test, .invalid…): nesses o link fica só na auditoria.
  - **LGPD:** exportar (JSON, administrador) e anonimizar. Se a pessoa só tem acesso a esta empresa, nome, e-mail e celular são apagados e a conta é bloqueada; se tem outros portais, é só removida deste.
- **Telas:**
  - **Clientes › aba Portal** (equipe interna): liga o portal do cliente; pessoas (perfil, desativar/reativar, exportar e anonimizar), convites (reenviar/cancelar), equipes e pedidos de acesso.
  - **Portal:**
    - página do link do convite (cria a senha e cai no aceite dos termos);
    - "Solicitar acesso" (link na entrada);
    - "Usuários e equipes" do Supervisor, com seletor quando ele supervisiona mais de um cliente.
  - **Configurações › Portal:** pedidos de acesso da empresa (aprovar escolhendo o cliente ou recusar); o aviso do sino abre essa seção mesmo já estando em Configurações.
  - **Super Admin:** chave pública do anti-robô.
  - Em tela: o Usuário comum não vê o atalho nem a área de gestão.
- **Anti-robô (Turnstile):** o formulário só mostra a verificação quando a chave pública está salva e só exige quando o segredo `TURNSTILE_SECRET` da função estiver configurado. Com as chaves configuradas (2026-10-10), o "Solicitar acesso" exige a verificação além do limite por origem. O widget foi criado e as chaves configuradas em 2026-10-10 (ver abaixo). O login do portal **não** usa captcha (mudaria também o login interno); fica anotado.
- **Testes na URL pública:**
  - API, 57 verificações: convites, token, expirado, revogado, reenviar, aceitar, conta existente em outro cliente, bloqueios por perfil, pedidos, limite, aprovação, anonimização, lista e reativação;
  - tela, empresa + convidada + Supervisora no celular + visitante, aprovações, sino, LGPD e seletor de clientes;
  - roteiro de SQL de isolamento com as novas checagens (0 falhas, falhas plantadas detectadas);
  - regressão completa: login do ATOS, E1, endereço do portal, E2 (admin, Atendente e técnico), Usuários, desativação e varredura das 16 telas.
- **Achados corrigidos no caminho:**
  - o roteiro de segurança vazio (acima);
  - a exportação marcada como somente-leitura gravava a auditoria;
  - aprovar pedido sem cliente caía na regra errada;
  - o aviso do sino não abria a seção quando já estava em Configurações;
  - pessoa anonimizada ainda aparecia/reativava.
- **Decisões do PO/Engenheiro (a confirmar):**
  1. O pedido de acesso é ligado ao cliente pelo **nome digitado** (comparação exata sem acento/caixa). Quem acerta vai ao Supervisor do cliente (e à empresa); quem não acerta vai só à empresa. O portal não lista clientes (não expõe quem a empresa atende).
  2. O Supervisor pode convidar outros **Supervisores**.
  3. Notificação por e-mail da aprovação/recusa usa o remetente da empresa.
  4. Limites de usuários por plano e verificação em duas etapas do Supervisor ficam para a F8 / Etapa 2.
- **Massa de teste do DEV:** `portal.teste@example.com` (Supervisora) segue; os resíduos de teste (e3, e3ui, removido-) foram apagados.
- **✅ Decisões 1 a 4 CONFIRMADAS pelo usuário em 2026-10-10** (pedido ligado ao cliente pelo nome digitado; Supervisor convida outros Supervisores; login do portal sem captcha; limite de usuários e verificação em duas etapas do Supervisor para a F8/Etapa 2).
- **Anti-robô LIGADO em 2026-10-10:** o usuário criou o widget (hostname vluma.com.br) e enviou as chaves.
  - A **Site Key** (pública) está em `portal_plataforma.turnstile_site_key` (Super Admin › Configurações).
  - A **Secret Key** está como segredo `TURNSTILE_SECRET` da função `portal-acesso` e **entra na lista de troca do fim do MVP**.
  - **Testado:** o formulário mostra a verificação da Cloudflare; sem concluir, a tela recusa; o servidor recusa pedido sem verificação e com token falso (nada é gravado); com verificação válida (chave de teste oficial da Cloudflare, temporária, já restaurada) o pedido é aceito.
  - **Não dá para automatizar:** a Cloudflare bloqueia o clique em navegador automatizado (erro 600010). A conclusão pelo widget REAL é conferida pelo usuário num navegador de verdade, no teste ponta a ponta.
- **A tratar no teste ponta a ponta (decisão do usuário, 2026-10-10):**
  - concluir o widget do Turnstile num navegador real e ver o pedido de acesso ser aceito;
  - convite e pedido de acesso **com e-mail real** (os de `example.com` não são enviados), conferindo o texto, o remetente e o link recebidos.

### Portal de atendimento — Etapa 1 · E4 Abrir e acompanhar chamado (2026-10-10) — CONCLUÍDA E TESTADA
Desenho aprovado em 2026-10-08 (VISAO_ATOS.md 9.1, pontos 2, 3, 4 e 6).
- **Migrations 061 e 062:**
  - **OS:** `origem` (interno/portal/whatsapp/email), `solicitante_id`, `equipe_id`, `compartilhado_equipe`, `prioridade_informada`, `preferencia_agendamento`.
  - **Tabelas novas:** `os_anexos_cliente`, `os_tambem_afeta`, `portal_preferencias`, `portal_avisos`.
  - **Empresa:** `tenants.portal_abertura` (tipos, prioridade e canais configuráveis).
  - **Armazenamento:** bucket **privado `portal-anexos`** (JPEG/PNG/WebP e áudio, até 10 MB). Cada pessoa grava só na própria pasta `<empresa>/<cliente>/<pessoa>/`; lê quem enxerga o chamado (dono, equipe, Supervisor), a equipe interna e o técnico responsável.
  - **Funções do portal:**
    - `portal_abertura_config`, `portal_abrir_chamado`, `portal_listar_chamados`, `portal_obter_chamado`;
    - `portal_chamados_parecidos`, `portal_tambem_afeta`, `portal_avisos_data`;
    - `portal_minhas_preferencias`, `portal_salvar_preferencias`;
    - de apoio: `portal_perfil_no_cliente`, `portal_ve_chamado`, `portal_termos_aceitos`.
  - **Funções da empresa:** `salvar_portal_abertura`, `portal_info_chamado`. A `listar_os` ganhou o filtro de origem.
  - **062:** gatilho `fn_orders_avisar_portal` (pg_net + chave do Vault) chama a Edge Function `portal-avisos`.
- **Regras (todas no servidor):**
  - **Abrir** (**regra dos tipos mudou em 2026-10-10 — ver "3º retorno do usuário" abaixo: o tipo aparece sempre que a empresa o ativa; o assunto só é obrigatório se existirem categorias visíveis para o tipo.** Texto original mantido como histórico):
    - o chamado vira OS, **sem técnico**; o grupo vem do catálogo (E2);
    - exige vínculo ativo, portal da empresa e do cliente ligados e **termos de uso e privacidade aceitos**;
    - o tipo precisa estar ativo e a categoria visível no portal para aquele tipo (**subcategoria só aparece se a principal também aparecer**);
    - a unidade é do cliente e da equipe;
    - título de 3 a 120 e descrição de 10 a 4000 caracteres;
    - até 5 anexos, só da própria pasta e realmente enviados;
    - limite de 10 chamados por pessoa por hora.
  - **Prioridade (só Incidente):**
    - modo **matriz**: 2 perguntas ("Quem é afetado?" e "Quanto atrapalha?") e a prioridade sai da matriz do catálogo;
    - modo **simples**: 3 níveis, com texto editável pela empresa;
    - a informada fica guardada (`prioridade_informada`) e o N1 ajusta (a UI de reclassificação com motivo é da E5);
    - com "o cliente informa a prioridade" desligado, o chamado entra sem prioridade e usa a sugestão do catálogo;
    - Requisição e Preventiva têm nível próprio; Visita não tem SLA.
  - **Datas (Visita, Requisição, Preventiva):** até 3 opções, futuras, com **aviso do calendário da unidade** (feriado, fim de semana, unidade fechada).
  - **Quem vê:** o próprio chamado; os da equipe (se "compartilhar" estiver marcado); quem marcou "também me afeta"; o Supervisor vê todos do cliente. Só campos seguros saem: sem notas internas, transferências, e-mails ou celulares de terceiros; do técnico só o nome.
  - **Chamado parecido:** mesmo cliente, unidade e assunto, em aberto nos últimos 30 dias. Avisa sem revelar quem abriu; "também me afeta" faz a pessoa acompanhar e soma +1 afetado.
- **Avisos por e-mail** (função `portal-avisos`):
  - **Eventos:** aberto, agendado, em atendimento, resolvido e cancelado.
  - **Condições:** só com o **consentimento de comunicação** (LGPD) ativo, o e-mail liberado pela empresa e não desligado pela pessoa. Um aviso por chamado e evento; remarcar a data gera aviso novo.
  - **Remetente:** o e-mail próprio da empresa, ou "<Empresa> via ATOS".
  - **Nunca** envia para domínios de teste (example.com, .test, .invalid…): grava o texto em `portal_avisos.detalhe`.
  - WhatsApp automático **não existe** (depende das Conexões de WhatsApp): nas preferências aparece como "indisponível", sem prometer o que não há.
- **Telas do portal** (celular primeiro, sem rolagem horizontal):
  - **Menu:** Início, Chamados, Preferências (e Usuários e equipes para o Supervisor).
  - **Início:** botão grande "Abrir chamado", contadores (abertos e resolvidos no mês) e os chamados em andamento.
  - **Abrir chamado:**
    - cartões de tipo em linguagem do cliente;
    - assunto ("pai › filha", com descrição);
    - unidade filtrada pela equipe;
    - aviso de chamado parecido (com "também me afeta" ou "é outro problema");
    - título e descrição;
    - **fotos** (câmera ou galeria, reduzidas no navegador) e **áudio gravado** (até 2 minutos);
    - prioridade em linguagem simples ou datas preferidas;
    - "compartilhar com a minha equipe".
    - Ao final: número do chamado e botão de WhatsApp da empresa.
  - **Chamados:** abas Abertos / Resolvidos / Todos, busca por número ou título, paginação.
  - **Chamado:** 4 etapas (Recebido → Agendado → Em atendimento → Resolvido), data agendada, nome do técnico, dados, fotos e áudio (endereços assinados), "também me afeta", marcos do andamento e WhatsApp.
  - **Preferências:** consentimento de comunicação (dado e retirado aqui), canal de e-mail (só se a empresa liberou) e celular.
  - As páginas internas do portal **só abrem com os termos aceitos** (direto pela barra de endereço, volta ao aceite).
- **Telas internas:**
  - **Configurações › Abertura de chamados pelo portal** (admin):
    - tipos ativos, nome e descrição de cada um (com aviso quando o tipo não tem nenhuma categoria visível);
    - "o cliente informa a prioridade" e o texto de cada nível;
    - canal de e-mail.
  - **Detalhe da OS:** cartão "Aberto pelo portal" com solicitante (com contato para a equipe interna), equipe, afetados, prioridade informada e a atual (alerta se divergirem), datas pedidas (**"Agendar nesta data"** abre o agendamento já preenchido e "a pedido do cliente"), fotos e áudio, e **"Avisar o cliente pelo WhatsApp"** com mensagem pronta e o link do chamado.
  - **Lista de OS:** filtro de origem e selo "Portal".
  - **Sino:** "novo chamado do portal" vai ao coordenador do grupo (sem grupo ou coordenador, aos administradores, gestores e atendentes).
  - **App do técnico:** vê só o nome do solicitante e as fotos/áudio, sem contato nem botões.
- **Testes na URL pública:**
  - **SQL, `supabase/tests/portal_chamados.sql`, 71 verificações:** categorias, termos, visibilidade, duplicados, anexos, preferências, limites, configuração e isolamento. Provado com um vazamento de visibilidade plantado (5 falhas acusadas).
  - **Avisos, 9 verificações:** eventos, consentimento, canal da pessoa e da empresa, OS interna sem aviso, sem duplicar.
  - **Telas do cliente** (computador e celular, com fotos e áudio reais), **telas internas** e o app do técnico.
  - **Falhas encontradas e corrigidas nos testes:**
    - duas comparações com NULL no SQL deixavam passar um pai de categoria oculto e uma prioridade em branco;
    - imagem ilegível mostrava mensagem técnica em inglês (agora, texto amigável);
    - o aviso de novo chamado vai ao coordenador do grupo (era expectativa errada do teste).
- **Decisões do PO/Engenheiro (a confirmar):**
  1. O aviso de "novo chamado" vai ao **coordenador do grupo**; só sem grupo ou sem coordenador vai a admin, gestor e atendente.
  2. O Supervisor vê **todas** as OS do cliente, inclusive as abertas pela equipe interna.
  3. Fotos são reduzidas a 1600 px no navegador; no máximo 5 arquivos e 1 áudio por chamado.
  4. **Rascunhos órfãos:** arquivo enviado e não usado (a abertura falhou e a limpeza também) fica no bucket; há limpeza automática no cliente, mas não uma varredura no servidor (backlog).
  5. A confirmação do atendimento sobre a **data** que o cliente pediu e a conversa entram na **E5**.
- **PRD:** o gatilho da 062 tem a URL do projeto DEV escrita (como a 030): trocar pelo ref do PRD.

### Portal — ajustes do 1º teste manual do usuário (2026-10-10, após o fechamento da E4)
O usuário testou o "Solicitar acesso" no navegador real (com e-mail e celular dele) e levantou 4 pontos:
1. **Verificação "Sucesso!" aparece sozinha — está correto.** O widget do Turnstile está no modo Gerenciado: quando o navegador parece de pessoa, a Cloudflare conclui sem pedir clique. O aviso "siteverify não está sendo chamado" do painel da Cloudflare **não é falha**: a função `portal-acesso` chama o `siteverify` (provado: sem token e com token falso → 400); a Cloudflare só deixa de avisar depois de ver um token real validado. Os 44% "provavelmente humano" vêm dos testes automáticos. Não usar "Corrigir com o Spin".
2. **O pedido só avisava no sino.** Agora há a aba **"Solicitações (n)" em Usuários** (ao lado de Técnicos; fica âmbar quando há pendentes) com a lista de pedidos; o sino abre direto essa aba (também para avisos antigos). O link gravado nos avisos novos mudou na função `portal-acesso` (republicada no DEV).
2b. **Bloco fora dos termos:** os pedidos saíram do cartão "Portal de atendimento" (Configurações), onde ficavam junto dos termos.
3. **"Escolhi Atakarejo e não trouxe o cliente":** o Atakarejo existe, mas está com **portal desligado** (o roteiro `e3_api` o desliga de propósito), e só clientes com portal ligado podem receber convite. A tela dizia só "cliente não reconhecido". Agora: (a) avisa "O cliente 'Atakarejo' existe, mas o portal dele está desligado — ligue na aba Portal do cliente"; (b) a lista mostra todos os clientes ativos, os desligados aparecem desabilitados com "— portal desligado".
- **Ponto aberto:** a aba fica em Usuários, que só o administrador abre; o gestor também é avisado e a função aceita a decisão dele, mas não alcança a tela (já era assim em Configurações). Decidir: liberar a aba ao gestor ou avisar só administradores.
- **Testes:** `e2e/e3_ui.mjs` atualizado (aviso → Usuários › Solicitações, contagem na aba, cliente com portal desligado) e dois checks vazios antigos trocados por verificações reais.
- **Resíduo de teste:** o pedido real do usuário (Sergio Teste, sergio.dorea2624@gmail.com, "Atakarejo") continua pendente de propósito; os resíduos `e3ui.*` são limpos pelo próprio roteiro.

### Portal — 2º teste manual do usuário (2026-10-10): convite, celular, rodapé e tipos de chamado
O usuário aprovou o próprio pedido e criou a conta pelo convite real (e-mail verdadeiro). Achados:
1. **"Repita a senha" sem o olho de mostrar:** corrigido. Novo componente `src/portal/CampoSenha.tsx` (botão mostrar/ocultar) usado em criar senha (os 2 campos) e em "Criar nova senha" (os 2 campos). O login já tinha.
2. **Celular do pedido se perdia (bug):** o `portal_solicitacoes_acesso.celular` não passava para o convite; a tela de criar senha abria em branco e a pessoa ficava sem celular (Preferências vazio). **Migration 063** (`portal_convites.celular`, aplicada no DEV); a função `portal-acesso` (republicada) grava o celular no convite ao aprovar, devolve em `consultar` e o cadastro usa `celular do formulário ?? celular do convite`; a tela já abre preenchida. Quem já tinha conta antes do ajuste (o próprio usuário) preenche em Preferências.
3. **Rodapé "Termos de uso · Privacidade · Tecnologia ATOS · VLUMA" no meio da tela:** as telas curtas deixavam o rodapé logo abaixo do conteúdo. Agora ele fica **colado no fim da janela** (início, abrir, chamados, preferências, usuários) — computador e celular.
4. **Só 2 tipos de chamado em "Abrir chamado" (Relatar um problema e Solicitar visita técnica) — comportamento esperado, não defeito:** o cartão de um tipo só aparece se existir ao menos uma categoria **visível no portal** para aquele tipo. Hoje as categorias reais do catálogo ("Câmera sem imagem") estão dentro de **CFTV, que está oculta no portal**; só a categoria de teste "E2-UI Categoria" (incidente e visita) aparece. Ao ocultar a categoria pai, as filhas somem do portal (regra da E4). Para mostrar Requisição e Preventiva: em Catálogo e SLA, deixar visível a categoria (e a pai) e marcar esses tipos.
5. **Onde abrir o portal (pergunta do usuário):** hoje só em **Configurações › Portal de atendimento › "Abrir o portal"** (abre a prévia da equipe) e pelo endereço direto `https://atendimento.infoxtec.dev.vluma.com.br`. Não existe item no menu lateral — fica difícil de achar. **Proposta ao usuário:** item "Portal do cliente" no menu do administrador (aguardando resposta).
- **Testes:** `e2e/portal_ajustes.mjs` (15 verificações na URL pública: celular do pedido ao convite e ao cadastro, olho de senha nos dois campos sem interferir um no outro, rodapé no fim em 3 telas e no celular, sem rolagem horizontal). Os testes do convite não deixam resíduo (`e5aj.*` limpos pelo roteiro).

### Portal — 3º retorno do usuário (2026-10-10): menu, tipos de chamado e e-mail único
Respostas do usuário: (1) item de menu "Portal do cliente" — de acordo; (2) **os tipos de chamado devem ser escolhidos no painel de configuração, não atrelados à categoria habilitada**; (3) a aba Solicitações dentro de Usuários atende; (4) **garantir que não é possível cadastrar usuário com e-mail já existente na base**.
- **Menu "Portal do cliente"** (administrador e gestor; só quando a empresa tem o módulo): primeira versão abria a prévia em outra aba; **substituída no 4º retorno** pela página `/portal-cliente` (ver abaixo). O Atendente não vê.
- **Tipos independentes de categoria (migration 065):** o cartão do tipo aparece sempre que a empresa o **ativou** em Configurações › Abertura de chamados. O campo **Assunto** só aparece (e só é exigido) quando existem categorias visíveis no portal para aquele tipo; sem nenhuma, o chamado entra **sem assunto, sem grupo, na fila de entrada** (o N1 classifica). Com categorias, continua obrigatório e a categoria precisa valer para o tipo. Tipo desativado continua indisponível (no servidor também). Na configuração, o aviso por tipo virou informativo ("sem categoria: o cliente abre sem assunto e cai na fila de entrada") e passou a respeitar a regra do pai oculto.
- **E-mail único (migration 064 + `e2e/email_unico.mjs`):**
  - Já estava garantido pelo Auth (`auth.users`, único) e pelas funções (`criar-tecnico` → "Já existe um usuário cadastrado com este e-mail", em qualquer caixa; convite/pedido do portal recusam e-mail da equipe interna; quem já tem conta do portal é reaproveitado, sem conta duplicada; cadastro público fechado).
  - **Lacuna achada:** as tabelas do app (`users`, `portal_pessoas`) não tinham unicidade própria — uma escrita direta aceitava e-mail repetido e o mesmo e-mail nos dois lados (3 verificações falharam antes da correção). A 064 cria índice único por `lower(email)` nas duas e travas entre equipe interna e portal. Não havia duplicados na base.
  - Observação: "e-mail com espaços" é recusado como inválido (o formulário já faz trim).
- **Testes:** `email_unico.mjs` (19 verificações), `portal_tipos.mjs` (17 verificações na URL pública), `portal_chamados.sql` agora com **73** verificações (validado com falha plantada; o check antigo "só os tipos com categoria visível" foi substituído pela regra nova). Regressão de contas (e2_usuarios, inativo, e4_avisos, e4_ui, e3_api, e3_ui) e `e4_interno` OK após 064/065.
- **Decisões a confirmar:** chamado sem categoria cai na fila de entrada (N1 classifica) — vale também para incidente em modo matriz (sem sugestão de impacto/urgência do catálogo); e-mail com maiúsculas é tratado como o mesmo e-mail.

### Portal — 4º retorno do usuário (2026-10-10): esclarecimentos e página "Portal do cliente"
1. **"Matriz" mal entendido:** na pergunta ao usuário, "matriz" era a **matriz Impacto × Urgência** (modo de prioridade), não a sede da empresa. A **unidade escolhida pelo cliente continua gravada na OS** (`location_id`), com ou sem assunto. Sem assunto, o chamado cai na **fila de entrada da empresa** (sem grupo), e a unidade continua nele.
2. **Tipos sem categoria:** confirmado e já entregue (migration 065): habilitar a opção de abertura em Configurações não exige categoria; a categoria só acrescenta o campo "Assunto". (O pedido de "deixar a CFTV visível" era só para quem quiser o campo Assunto.)
3. **"Cliquei em Portal do cliente e não entendi a funcionalidade":** o item abria só a prévia de identidade da E1 ("É assim que seus clientes veem o portal", botão desabilitado). **Agora o item abre a página `/portal-cliente`** (administrador e gestor; só para empresas com o módulo): o que é o portal, o **endereço que os clientes usam** (copiar / abrir a tela de entrada em outra aba), o status (ativo ou em prévia) e a lista **"o que falta para os clientes abrirem chamados"** (portal ligado, clientes com portal ligado, tipos liberados, pedidos de acesso esperando) com atalho para cada ajuste. Explica também que a equipe não abre chamados pelo portal e como ver como o cliente vê (janela anônima + conta de cliente).
4. **Aba Solicitações em Usuários:** aprovada pelo usuário ("já atende"). Ponto do gestor encerrado.
- **Testes:** `e2e/portal_tipos.mjs` (23 verificações na URL pública, inclui a nova página: endereço, 4 linhas do checklist, "4 de 4 tipos", "n cliente(s)", Atendente não vê o item).
- **Validação do usuário (2026-10-10): página "Portal do cliente" aprovada ("Está ótimo").** Os ajustes do 1º ao 4º teste manual do portal (convite, celular, rodapé, tipos, e-mail único, menu, página) estão fechados.
- **Ponto aberto:** a prévia antiga (`PreviaInterna`, quando a equipe abre o endereço do portal logada) continua existindo no endereço do portal; avaliar na E6 se vale substituí-la por um aviso com link de volta para esta página.

### Pesquisa de mercado sobre agendamento e pausa de SLA (2026-10-10)
Pedido do usuário: "como os grandes players trabalham e o que o ITIL recomenda?". **Achado: não há regra do ITIL específica**; o que existe é prática de ITSM e de field service. Resumo e fontes:
- **Pausar o SLA:** só por espera documentada (cliente indisponível/aguardando), com motivo e horários de pausa e retomada registrados, visível nos relatórios, sem usar a pausa para "melhorar" o cumprimento; para pausa a pedido do cliente, definir data de retorno ou duração máxima e retomar sozinho. ServiceNow (condição de pausa por motivo "aguardando o solicitante"), Zendesk (pausa em Pendente), Freshservice (liga/desliga o relógio por status).
- **Field service:** confirmação logo após marcar; lembretes em 1 semana / 1 dia / 2 h (ou 48 h e manhã do dia); Confirmar/Reagendar/Cancelar em 1 clique; janelas de chegada estreitas + aviso de chegada; reagendar fácil; política de cancelamento visível; medir ausências por dia/horário.
- Fontes: [Cornell — status e SLA](https://tdx.cornell.edu/TDClient/189/Portal/KB/ArticleDet?ID=7714), [Ivanti — Stop the Clock](https://help.ivanti.com/ch/help/en_US/CSM/2023/documentation_bundle/record_management/sla_stop_the_clock_stc.htm), [Xurrent — relógio parado](https://www.xurrent.com/blog/clock-stopped-system-notification), [ServiceNow — condições de SLA](https://www.servicenow.com/docs/bundle/zurich-it-service-management/page/product/service-level-management/concept/c_SLAConditions.html), [Zendesk — pausar SLA](https://support.zendesk.com/hc/en-us/articles/4408825745690-Can-I-pause-the-SLA-timer-or-reset-it-under-certain-conditions), [Freshservice — status e SLA](https://support.freshservice.com/en/support/solutions/articles/156452-customizing-service-desk-statuses), [Fieldproxy — lembretes e ausências (blog de fornecedor; números são alegações)](https://www.fieldproxy.ai/blog/how-to-eliminate-no-shows-in-hvac-business-with-smart-scheduling-d1-14).
- O desenho resultante está em `VISAO_ATOS.md` (E5, "Respostas do usuário sobre a Visita e o agendamento").

### Portal — Etapa 1 · E5a Conversa e triagem (2026-10-10) — CONCLUÍDA E TESTADA
Desenho aprovado em 2026-10-10 (VISAO_ATOS.md, E5: "pontos decididos"). Próximas partes: **E5b** (matriz de pausa, "Aguardando você", pausa do SLA ao reagendar, agendamento combinado, transparência do prazo, fluxo da visita) e **E5c** (Resolvido → Fechado, reabrir, novo chamado ligado, assinatura como confirmação).
- **Migration 066:**
  - `order_comments`: `visibilidade` (`interno` padrão | `cliente`) e `autor_portal_id` (pessoa do portal). A escrita direta na tabela só cria nota **interna** (política); responder ao cliente só pela função `os_comentar`. Editar um comentário não troca visibilidade nem autoria (gatilho).
  - `os_anexos_cliente.comentario_id`: fotos de uma mensagem do cliente.
  - `notificacoes`: tipo novo `mensagem_cliente`. `orders`: `classificada_em`/`classificada_por`.
  - Funções: `os_comentar` (equipe/técnico responsável), `portal_enviar_mensagem` (cliente), `os_triagem` (N1), e `portal_obter_chamado`/`portal_info_chamado` estendidas (conversa, reclassificação, modo/matriz/impacto/urgência).
  - Gatilho `fn_comentario_avisar_portal` (pg_net + Vault) → `portal-avisos` evento `mensagem`.
- **Conversa (regras no servidor):**
  - **Equipe** (OS aberta pelo portal): dois botões distintos, **"Responder ao cliente"** e **"Nota interna"** (a nota nunca sai da empresa). Em OS comum continua só o comentário interno. O **técnico responsável também responde ao cliente** pelo app (só texto). Resposta ao cliente: 1 a 2000 letras, não vale em OS cancelada nem em OS sem solicitante; técnico sem acesso à OS não comenta.
  - **SLA:** a 1ª resposta pública (ou a triagem) grava `respondido_em`.
  - **Cliente** (portal): quem **vê** o chamado (dono, equipe se compartilhado, Supervisor, "também me afeta") e aceitou os termos responde com texto (2 a 2000) e **até 3 fotos** (mesma pasta privada do chamado; arquivo de outra pessoa/fantasma é recusado); **20 mensagens por hora** por pessoa; chamado cancelado não recebe.
  - O portal mostra só a conversa pública (nunca nota interna), com o 1º nome de quem respondeu pela empresa ("Carla · atendimento") e "Você"/nome do colega nas mensagens do cliente; a pessoa do portal não lê `order_comments` diretamente.
  - **Avisos:** mensagem do cliente → sino do técnico responsável e dos coordenadores do grupo (sem ninguém: admin, gestor e atendente); resposta da empresa → **e-mail ao solicitante** (consentimento LGPD + canal liberado), no máximo **1 a cada 10 minutos por chamado**; o e-mail não traz o texto, só o aviso e o link.
- **Triagem pelo N1** (admin, gestor, atendente) no cartão "Aberto pelo portal":
  - **"Confirmar prioridade"** registra quem classificou e quando; **"Reclassificar"** exige **motivo** (3 a 300 letras, **visível ao cliente**). Só em OS do portal ainda não encerrada.
  - **Modo matriz:** o N1 ajusta **Impacto e Urgência** e a prioridade sai da matriz (o gatilho do SLA recalcula; ajustar a prioridade solta é recusado). **Modo simples:** escolhe a prioridade. Só o incidente tem prioridade ajustável; qualquer tipo pode trocar o **assunto**, e se o novo assunto tem grupo padrão a OS **vai para esse grupo**.
  - Guarda prioridade informada × final; o SLA recalcula a partir da abertura; o cliente vê "Prioridade ajustada de Crítico para Baixo — motivo…". Base do KPI "% reclassificados" (painel na E6).
- **Testes na URL pública:** `supabase/tests/portal_conversa.sql` (**54** verificações, validado com falha plantada) e `e2e/e5a_ui.mjs` (38 verificações: botões, selos, nota interna que não vaza, resposta com foto, sino, e-mail, triagem em modo matriz, Atendente, técnico no app e celular). **Achado e corrigido no teste:** no modo matriz o gatilho do SLA recalcula a prioridade por impacto×urgência, então reclassificar a prioridade solta não tinha efeito — a função passou a ajustar impacto e urgência.
- **Decisões a confirmar:** mensagem do cliente não retoma a pausa nem reabre OS concluída ainda (E5b e E5c); o e-mail de nova mensagem não traz o conteúdo (privacidade); limite de 20 mensagens/hora e 3 fotos; coordenador que seja técnico não recebe o aviso do grupo (regra já existente).
- **PRD:** o gatilho da 066 também tem a URL do DEV; republicar `portal-avisos` (evento `mensagem`).

### Portal — Etapa 1 · E5b parte 1 · Pausa com o cliente, "Aguardando você" e reagendar pausando o SLA (2026-10-10) — CONCLUÍDA E TESTADA
Desenho aprovado em 2026-10-10 (VISAO_ATOS.md, E5). **Resta da E5b:** transparência do prazo + "prazo explicado", agendamento combinado (calendário configurável, proposta de data), reagendar/cancelar pelo cliente, lembretes e fluxo da visita (cliente ausente, motivos de cancelamento, visita gera chamado) — em partes testadas uma a uma.
- **Migration 067:**
  - `motivos_pausa`: `comportamento` (`aciona` | `comunica` | `interno`), `texto_cliente`, `exige_previsao`. Os 4 motivos padrão foram classificados (Aguardando o cliente e Acesso não liberado = aciona; Peça ou material = comunica + previsão; Outro = interno); empresas novas já nascem assim. **O admin/gestor cadastra motivos novos** (nome, comportamento, texto, previsão, "para o relógio").
  - OS: `previsao_retorno`, `aguardando_cliente_desde`, `previsao_alertada_em`, `sla_agend_min`, `sla_agend_aberto_min`, `sla_agend_desde`, `sla_agend_ate`, `reagendamentos`; `tenants.sla_limite_reagendamentos` (padrão 3; 0 = sem limite; função `definir_limite_reagendamentos`).
  - Gatilho `fn_orders_pausa_cliente`, rotina `verificar_previsoes_pausa` (pg_cron a cada 15 min), notificação `previsao_vencida`; `fn_orders_sla`, `fn_orders_avisar_portal`, `portal_enviar_mensagem`, `portal_obter_chamado`, `portal_listar_chamados` e `portal_info_chamado` reescritas.
- **Pausa (servidor):** motivo que **exige previsão** sem previsão futura é recusado. Motivo que **aciona** numa OS do portal exige que a **mensagem pública** ao cliente tenha sido enviada agora há pouco pelo próprio usuário; marca "aguardando o cliente desde…". OS sem solicitante (aberta pela equipe) não exige mensagem. Ao sair da pausa, previsão e "aguardando" são limpos.
- **Telas da equipe:** o modal de Pausar (OS e app do técnico) pede, conforme o motivo, a **mensagem ao cliente** e/ou a **previsão de retorno** e explica o que o cliente verá; Catálogo e SLA › Motivos de pausa ganhou comportamento, texto, previsão e o campo **limite de agendamentos a pedido do cliente por chamado**; a ficha da OS mostra "Aguardando o cliente desde…", previsão e nº de agendamentos; sino com "previsão de retorno vencida".
- **Portal:** **"Aguardando você"** (selo na lista e no chamado, cartão no início "n chamados aguardam a sua resposta", banner com o pedido da empresa); **pausa que comunica** mostra "Em pausa: <texto>" e a previsão; pausa interna não aparece (o cliente segue vendo Em andamento). **A resposta do cliente retoma a OS sozinha** (o relógio do SLA volta, evento "retomada pelo cliente", aviso ao técnico). E-mail "chamado em pausa" (texto + previsão) quando a pausa comunica.
- **Reagendar parando o SLA (decisão do usuário):** botão **Reagendar** na OS agendada (OS e app); agendar/reagendar **a pedido do cliente** (incidente e requisição com SLA) cria um **crédito de pausa em horas úteis do calendário da OS até a nova data**, **mantendo o tempo já gasto** (a base do SLA não muda; atendimento e solução andam pelo crédito). Iniciar antes da data devolve o crédito não usado; reagendar refaz o crédito; **limite de agendamentos por chamado** configurável (padrão 3). Visita não tem SLA (sem crédito). Reagendar já vem marcado "a pedido do cliente" quando o agendamento anterior era.
- **Testes na URL pública:** `supabase/tests/pausa_agendamento.sql` (**35** verificações, validado com falhas plantadas) e `e2e/e5b1_ui.mjs` (**39** verificações: motivos cadastráveis, pausa aciona/comunica/interno, resposta do cliente retoma, e-mail, técnico no app, reagendar, limite).
- **Decisões a confirmar:** o crédito usa horas úteis do calendário da unidade; vale só para incidente e requisição; o limite padrão é 3 agendamentos a pedido do cliente por chamado; a previsão vencida alerta o técnico responsável e os coordenadores do grupo (sem eles, admin e gestor).

### Portal — Etapa 1 · E5b partes 2 a 4 e E5c (2026-10-10) — CONCLUÍDAS E TESTADAS · **E5 COMPLETA**
Pedido do usuário: "vamos concluir e depois realizo um teste regressivo". Desenho aprovado em VISAO_ATOS.md (E5 e retornos de 2026-10-10).

**E5b-2 · Transparência do prazo e "prazo explicado" (migration 068)**
- Por empresa, o admin escolhe o que o cliente vê dos prazos (Configurações › Abertura de chamados › "Prazos que o cliente vê"): **Oculto**, **Previsão** (padrão: previsão de atendimento e de solução em data/hora) ou **Completo** (+ "No prazo / Fora do prazo"). **Exceção por cliente** na aba Portal do cliente. Visita nunca mostra prazo.
- **Prazo explicado:** o andamento mostra as pausas que o cliente pode ver (aciona/comunica, nunca a interna e nunca o texto interno), a retomada ("o prazo ficou parado de … a …") e o agendamento a pedido do cliente. Testes: `transparencia_prazo.sql` (20), `e5b2a_ui.mjs` (17).

**E5b-3 · Agendamento combinado (migration 069)**
- **Regras da empresa** (Configurações › Agendamento de visitas e atendimentos): antecedência mínima (padrão **48 h**), horizonte (60 dias), janelas **Manhã/Tarde** com nome e horário, se o cliente pode reagendar (até N horas antes, máx. N vezes, motivo obrigatório ou não), se pode cancelar (até N horas antes) e **até 3 lembretes** (N horas antes). O servidor valida as datas pedidas e a tela de abrir mostra a regra e só deixa escolher dentro dela.
- **Data "confirmada" × "proposta":** agendar numa das datas pedidas (ou "a pedido do cliente") = confirmado; numa data que o cliente não pediu = **proposta** (o cliente vê Aceitar / Pedir outra data). O cliente também **reagenda** um confirmado, **confirma presença** e **cancela**, nos limites; "Agendar nesta data" usa o início da janela da empresa. A equipe é avisada no sino.
- **Lembretes** por e-mail (rotina de 15 em 15 min) com Confirmar / Reagendar / Cancelar (links `?acao=`). Testes: `agendamento_combinado.sql` (53), `e5b3_ui.mjs` (26).

**E5b-4 · Cliente ausente, motivos de cancelamento e visita que gera chamado (migration 070)**
- **Motivos de cancelamento cadastráveis** (Catálogo e SLA › Motivos de cancelamento); do sistema: "Cancelado pelo cliente" e "Cliente ausente" (sempre visita improdutiva); cancelar uma OS passa a escolher um motivo da lista.
- **"Cliente ausente"** no app do técnico: registra a **hora** e a **posição** (como prova, no evento); as **fotos do local ficam nas Evidências** (o aviso sugere tirá-las antes de confirmar). A OS fica Cancelada como visita improdutiva; o cliente vê "Visita não realizada: cliente ausente" (e recebe e-mail) e **pede nova visita** (nova Visita ligada à anterior; uma de cada vez).
- **Visita gera chamado:** botão "Gerar chamado a partir da visita" (equipe e técnico responsável) cria um Incidente ou Requisição **ligados** ("relacionada a"), com o mesmo cliente, unidade e solicitante, que entra na triagem do N1. Orçamento continua no backlog. Testes: `cliente_ausente_visita.sql` (36), `e5b4_ui.mjs` (25).
- **Achado de segurança (roteiro de isolamento):** a função-semente dos motivos de cancelamento ficou executável por qualquer usuário; corrigido na 071 (revoga). Foi o roteiro `seguranca_isolamento.sql` que acusou.

**E5c · Resolvido → Fechado (migration 071)**
- **Concluída = "Resolvido"** no portal, com o resumo do que foi feito, o **relatório em PDF** (função nova `portal-relatorio`, URL assinada de 5 minutos) e **Confirmar solução / Não foi resolvido**. Confirmar fecha; **sem resposta em N dias úteis (padrão 3, configurável; 0 desliga)** o chamado fecha sozinho (rotina de 30 em 30 min).
- **"Não foi resolvido"** (motivo obrigatório) **reabre** a OS para o mesmo grupo/técnico, avisa o responsável, conta a reabertura e **o tempo entre resolvido e reaberto não conta no SLA** (crédito em horas úteis). **Depois de Fechado não reabre**: o cliente abre um **novo chamado relacionado** (banner "relacionado a OS-…"). A equipe ainda pode reabrir (limpa o fechamento).
- **Assinatura do solicitante em campo = confirmação:** ao concluir uma OS do portal, a tela de assinatura pergunta **"Quem está assinando?"** (o solicitante, padrão, ou outra pessoa); se foi o solicitante, o chamado **já nasce Fechado**. OS abertas pela equipe não mudam.
- As OS já concluídas antes da 071 foram marcadas como fechadas (não ficam "aguardando confirmação"). Testes: `resolvido_fechado.sql` (30, falhas plantadas detectadas), `e5c_ui.mjs` (28, incluindo assinatura desenhada, PDF e reabertura).

**Lições dos testes:** a conclusão com assinatura leva ~10 s (espera pelo fechamento do modal, não por tempo fixo); o 2º quadro de assinatura só aparece depois de carregar o perfil; o Chromium sem tela baixa o PDF em vez de abri-lo (conferir a resposta da função); comandos do mesmo `SELECT` não enxergam o que a rotina grava (usar comandos separados); "amanhã" é data válida com antecedência de 48 h. **Regressão final (2026-10-10): 9 roteiros de SQL com 0 falhas e todos os roteiros de tela OK**; os 3 pontos que falharam eram de teste (espera fixa do portal, horário "Agendar nesta data" que agora usa o início da janela da empresa, e script auxiliar do antirrobô, agora versionado em `e2e/com_antirobo_de_teste.sh`).

**Decisões do PO/Engenheiro a confirmar (resumo):** crédito de SLA em horas úteis do calendário; limite padrão de 3 agendamentos a pedido do cliente por chamado e de 2 reagendamentos pelo portal; janelas padrão Manhã 08–12 / Tarde 13–18 e antecedência de 48 h; lembretes padrão 48 h e 24 h; fechamento automático em 3 dias úteis; "Cliente ausente" guarda hora e posição (foto nas Evidências); cancelar pelo portal vale para qualquer chamado ainda não iniciado; o e-mail de lembrete só sai na janela (1 h de tolerância).

### Roteiro de teste manual da E5 (para o teste de regressão do usuário)
Use **https://atosdev.vluma.com.br** (equipe) e **https://atendimento.infoxtec.dev.vluma.com.br** (cliente, em janela anônima). Conta de cliente: a que você criou pelo convite (ou convide outra em Clientes › Portal). Marque o que não funcionar e me diga o número do passo.
1. **Conversa:** abra um chamado do portal na OS; "Responder ao cliente" e "Nota interna". No portal, a resposta aparece e a nota não. Responda como cliente, com foto.
2. **Triagem:** na OS, "Reclassificar" com motivo (e mudando o assunto); o cliente vê "Prioridade ajustada… Motivo…".
3. **Pausa:** pause com "Aguardando o cliente" (escreve a mensagem) → o cliente vê "Aguardando você" no início, na lista e no chamado; ao responder, a OS volta sozinha para Em andamento. Pause com "Aguardando peça ou material" (previsão) → o cliente vê "Em pausa… previsão". Em Catálogo e SLA › Motivos de pausa, cadastre um motivo novo.
4. **Prazos:** em Configurações › Abertura de chamados, troque entre Oculto / Previsão / Completo e veja no portal; abra uma exceção por cliente.
5. **Agendamento:** em Configurações › Agendamento, mude a antecedência e as janelas; no portal, abra uma Visita e confira o calendário. Agende numa data que o cliente não pediu (proposta) e teste Aceitar / Pedir outra data / Reagendar / Cancelar. Confira os lembretes por e-mail (use um e-mail real).
6. **Reagendar com SLA:** em uma OS agendada use "Reagendar" "a pedido do cliente" e confira o prazo na ficha do SLA.
7. **Cliente ausente:** no app do técnico, "Cliente ausente" numa visita (permita a localização); o cliente vê "Visita não realizada" e "Pedir nova visita". **Gerar chamado** a partir de uma visita.
8. **Cancelar:** cancele uma OS e escolha o motivo; cadastre um motivo novo em Catálogo e SLA › Motivos de cancelamento.
9. **Resolvido → Fechado:** conclua uma OS do portal **sem** assinar o solicitante → o cliente vê "Resolvido" (resumo e PDF), confirma ou diz "Não foi resolvido". Conclua outra assinando como o **solicitante** → já nasce Fechado. Num chamado fechado, "Abrir novo chamado relacionado".
10. **Celular:** repita o início do portal e um chamado no celular (sem rolagem para o lado).

### Ação adiada para o FIM do desenvolvimento (decisão do usuário, 2026-09-25 — sem urgência)
- **Limpeza dos dados de teste do DEV**: checklists "Teste Volume 1–60",
  "Teste Concluído Antigo", "Teste Semanal", "Teste Dia Util", "Teste
  Único Atrasado", OS-0018 a OS-0030, o usuário atendente.teste@infoxtec.com.br, os grupos de teste (Central N1, Redes N2, Campo Interior), os técnicos sem empresa sdoreaestudo@gmail.com e sdoreaestudo1@gmail.com, a pessoa de teste do portal portal.teste@example.com e fotos de teste na OS-0010. Não
  apagar antes — servem de massa para testes e validação

### Credenciais a trocar no FIM do MVP (não antes — decisão do usuário)
Token de acesso do Supabase (Management API), PAT do GitHub embutido no
remote de `C:\vluma\atosdev`, senha de app do Zoho de
noreply@vluma.com.br (segredo `SMTP_PADRAO_SENHA`), chave do LocationIQ
(cadastrada pela tela do Super Admin).
**2026-09-25:** novo token da Management API e as senhas dos usuários de
teste (Super Admin, admin Infoxtec, técnico atendimento@) foram enviados
pelo chat — trocar também no fim do MVP (guardados só no scratchpad da
sessão, nunca no git).
**2026-10-09:** token da **Cloudflare** (conta adm@vluma.com.br, token de usuário `cfut_…`, permissão só "Editar DNS" na zona vluma.com.br) enviado pelo chat para o subdomínio automático do portal — guardado só no scratchpad; **trocar no fim do MVP** (e revogar o atual na Cloudflare). **2026-10-09:** token da **Vercel** (`vcp_…`, criado em Account Settings › Tokens com escopo no projeto atosdev; enxerga só esse projeto) enviado pelo chat — guardado só no scratchpad e como segredo da função `portal-endereco`; **trocar no fim do MVP** (revogar o atual na Vercel e atualizar o segredo).

**2026-10-10:** as credenciais de DEV passaram a ficar também em `~/.atos-credenciais/` na máquina do usuário (fora do repositório e do `/tmp`, só o usuário lê), por decisão dele, depois de a pasta temporária da sessão ser apagada num reinício. **Apagar/trocar esse arquivo junto com as demais no fim do MVP.** Nunca versionar.

### Checklist da promoção para PRD (zeejmwdyqrbjnkhwtdsu)
- **Auth do PRD (Management API):** `disable_signup = true`, `site_url` = domínio do PRD, `uri_allow_list` com o domínio do PRD e `https://*.vluma.com.br/**` (portal) — sem isso, a falha corrigida na 048 continua aberta no PRD
- Aplicar migrations 001–071 em ordem (**062, 066, 067 e 069: trocar a URL do projeto nos gatilhos e na rotina de lembretes**; as migrations 067, 069 e 071 agendam no pg_cron `atos-previsoes-pausa`, `atos-lembretes-agendamento` e `atos-fechar-resolvidos` — conferir `select * from cron.job`) (depois, rodar `supabase/tests/seguranca_isolamento.sql` no PRD com uma pessoa de teste do portal; `grupos_atendimento.sql` precisa da massa de teste do DEV e não roda no PRD) (045 agenda `atos-alertas-sla`; 046 faz backfill dos tempos das OS concluídas). Publicar de novo a função
  `gerar-relatorio-os` (v10: tipo/categoria/SLA no PDF). **038 instala o pg_cron e agenda
  `atos-gerar-ocorrencias`** — conferir `select * from cron.job` no PRD. Depois da 036, rodar
  `supabase/scripts/ajustar_cidade_ibge.py <ref PRD> --aplicar` (código
  IBGE das Unidades existentes) e conferir que os feriados nacionais do
  ano estão gerados (a migration gera 2025–2036; depois disso, botão
  "Gerar nacionais" do Super Admin em Calendários). **Atenção migration 030**: o
  gatilho `fn_orders_relatorio_ao_concluir` tem a URL do projeto DEV
  (`vgkiddqahubznlzkxfgb`) escrita — trocar pelo ref do PRD
- **Portal — endereços (PRD):** (a) publicar `portal-endereco` (verify_jwt true) e definir seus 5 segredos (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`) com o projeto da Vercel do PRD; (b) `portal_plataforma.dominio_base = 'vluma.com.br'` (no DEV é `dev.vluma.com.br`); (c) adicionar `atos.vluma.com.br` ao projeto da Vercel e a `VITE_PAINEL_HOSTS`, se mudar; (d) conferir os limites de domínios/uso comercial do plano Vercel (ver "Vercel — plano atual"); (e) links permitidos de recuperação de senha no Auth
- **Portal — E5c:** publicar a função nova **`portal-relatorio`** (verify_jwt true; assina a URL do PDF do relatório com a chave de serviço, depois de o banco conferir o acesso) e republicar `portal-avisos` (eventos mensagem, pausa, lembrete, cancelado improdutivo)
- **Portal — chamados (E4):** publicar `portal-avisos` (verify_jwt true; é chamada pelo banco com a chave de serviço do Vault); o bucket `portal-anexos` nasce na migration 061; conferir que o segredo `atos_service_role_key` existe no Vault do PRD
- **Portal — acesso (E3):** publicar `portal-acesso` (verify_jwt true); segredo `SITE_URL` com o domínio do PRD; **anti-robô:** criar o widget do Turnstile na Cloudflare (nomes de host: o domínio base da plataforma), salvar a chave pública no Super Admin e o segredo `TURNSTILE_SECRET` na função
- **Funções alteradas na E2:** republicar `criar-tecnico` (aceita o perfil; ignora usuário inativo), `geocodificar`, `enviar-relatorio`, `gerar-relatorio-os` e `portal-endereco` (ignoram usuário inativo)
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

