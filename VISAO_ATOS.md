# VISÃO ATOS — Documento Mestre do Produto

> **Fonte da verdade da VISÃO.** Complementa o `PROJETO_ATOS.md` (que registra o estado técnico do código).
> Consolidado a partir do `ATOS_Planejamento.docx` (v1.0, jun/2026) + histórico do Operax/Clarezza.
> Última consolidação: julho/2026.

---

## 1. O QUE É O ATOS

Plataforma **SaaS multi-tenant** para gestão de ordens de serviço de **equipes técnicas de campo**.

Cobre o ciclo completo do atendimento: abertura da OS → atribuição ao técnico → execução com checklists → registro de evidências fotográficas georreferenciadas → assinatura digital do cliente → entrega de relatório documentado.

**Objetivo:** substituir o controle manual de atendimentos de campo por uma solução digital que **padroniza a execução, comprova o serviço prestado e dá visão gerencial da operação**.

**Público:** empresas de serviços técnicos — CFTV, redes, controle de acesso, manutenção e correlatas. PMEs brasileiras (5–50 funcionários).

**Validador:** Infoxtec Tecnologia e Serviços — primeiro cliente, em parceria, **sem cobrança**, operando em campo real antes da abertura comercial.

### 1.1. Origem e evolução
O ATOS **evoluiu do Operax** — mesmo produto, refinado com foco em gestão de campo. A visão original (posicionamento, modelo comercial, ecossistema) permanece válida e está consolidada aqui.

---

## 2. POSICIONAMENTO — POR QUE SUPERAMOS O GLPI

| Concorrente | Problema |
|-------------|----------|
| **GLPI** | Grátis, mas **complexo demais** — exige time de TI para configurar e manter |
| **Zendesk / Freshdesk / Movidesk** | Cobram **por agente** (caro), focados em TI corporativo, portal do cliente só nos planos caros |

**Nosso diferencial:**
- **Simples de usar** — sem necessidade de time de TI
- **Portal do cliente incluso** (não é upsell de plano caro)
- **Insights nativos** no dashboard
- **Feito para campo** — mobile-first, evidências com GPS, assinatura, checklist
- **Mercado-alvo desatendido:** PMEs que precisam de algo mais profissional que WhatsApp/planilha, mas não podem pagar R$1.000/mês nem configurar GLPI

---

## 3. IDENTIDADE E STACK

**Marca:** padrão VLUMA (mesmo modelo do Plugado) — tema escuro, paleta roxo/ciano, assinatura "Desenvolvido por VLUMA".

**Stack:**
- Frontend: React + Vite + TypeScript + Tailwind + Shadcn/ui
- Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- Deploy: Vercel (auto-deploy) + Supabase Cloud
- Integrações: Z-API / Evolution API (WhatsApp), Asaas (pagamentos)

**Ambientes:**

| Ambiente | GitHub | Supabase |
|----------|--------|----------|
| DEV | VlumaOficial/atosdev | vgkiddqahubznlzkxfgb |
| PRD | VlumaOficial/atosprd | zeejmwdyqrbjnkhwtdsu |

---

## 4. ARQUITETURA MULTI-TENANT

Multi-tenant **desde a fundação**. Cada empresa cliente é um tenant com dados isolados via **RLS (Row Level Security)** no Supabase. Um tenant nunca acessa dados de outro.

### 4.1. Perfis de acesso

| Perfil | Descrição |
|--------|-----------|
| **Super Admin** | VLUMA. Acesso global a todos os tenants. Gerencia planos e exceções por cliente. |
| **Admin** | Administrador da empresa cliente. Gerencia usuários, configurações e permissões do seu tenant. |
| **Gestor** | Cria e distribui OS, acompanha a equipe, dispara comunicações. |
| **Técnico** | Executa OS em campo pelo celular, preenche checklists, coleta assinatura e evidências. |

---

## 5. ROADMAP DE FASES

| Fase | Descrição | MVP? | Status |
|------|-----------|------|--------|
| **F1** | Fundação: multi-tenant, autenticação, perfis, branding | Sim | ✅ Concluída |
| **F2** | Clientes e Locais (Unidades) | Sim | ✅ Concluída |
| **F3** | Ordens de Serviço (visão do Gestor) | Sim | ✅ Concluída |
| **F4** | App de Campo (visão do Técnico, mobile) | Sim | ✅ Concluída |
| **F5** | Checklists dinâmicos de verificação | Sim | ✅ Concluída |
| **F6** | Assinatura digital, evidências, PDF e envio | Sim | 🔄 Em andamento — **atualizado 2026-09-24:** Blocos A, B, C, D (Básico/Intermediário) e E feitos; falta o nível Avançado (Evolution). Antes: "Blocos A e B feitos" |
| **F7** | Painel gerencial e indicadores | Sim | ✅ Concluída e **validada pelo usuário** — **atualizado 2026-10-02** (migrations 046–047, testada na URL pública). Antes: "⏳ Pendente" |
| **F8** | Planos, Asaas, cobrança, trial | Não | 📋 Backlog |
| **F9** | Integração GLPI | Não | 📋 Backlog |
| **F10** | OWASP e segurança | Não | 📋 Pós-MVP |
| **F11** | Manual e documentação | Não | 📋 Pós-MVP |
| **F12** | App nas lojas (App Store / Google Play) — criada em 2026-10-08 a pedido do usuário; detalhes na seção 9.9 | A definir | 📋 Planejada — posição na sequência a definir |

> **2026-10-08 — revisão da sequência em discussão com o usuário:** esta tabela não mostra os módulos inseridos durante o desenvolvimento: Calendários (etapa 1 feita; escalas + notificação diária pendentes), SLA ITSM (feito, migrations 044–045), Portal de atendimento (em refinamento, seção 9.1, Etapas 1–3) e F12. O usuário sinalizou que as etapas não estão na sequência que esperava. A sequência consolidada será definida com ele e então refletida aqui.
>
> **Decisão do usuário (2026-10-08):** antes de colocar em produção (PRD), fazer o **plano de pagamento e suas integrações (F8)** e **depois todo o painel do Super Admin**.
>
> **Proposta de sequência consolidada levada (aguardando):**
> 1. Portal: fechar o refinamento (pontos 10–11) e construir a **Etapa 1**;
> 2. **Escalas + notificação diária**;
> 3. **Conexões de WhatsApp** (antes "F6 Avançado"; escopo ampliado em 2026-10-08 após pergunta do usuário):
>    - painel por empresa para escolher o modelo: **Aparelho** (atual, já feito) / **Evolution** (QR Code pela tela do ATOS, com aceite do risco) / **API oficial da Meta** (cadastro integrado da Meta, número dedicado, modelos de mensagem aprovados, custo por conversa);
>    - configuração da plataforma no Super Admin: servidor da Evolution; app da Meta com a VLUMA como "Tech Provider";
>    - modelos de mensagem;
>    - a oferta por plano é definida na F8;
>    - a burocracia da Meta (verificação da empresa) deve começar cedo, porque leva tempo;
>    - **Questionamento do usuário (2026-10-08):** é necessária, se a comunicação por WhatsApp sai do celular do técnico e a opção atual atende?
>      - **Parecer:** não é necessária antes da produção.
>      - O portal Etapa 1 funciona com **e-mail automático + botões de WhatsApp pelo aparelho**.
>      - Só dependem da conexão automática: os avisos automáticos de situação pelo WhatsApp (melhoria opcional) e a **abertura automática pelo WhatsApp** (Portal Etapa 3).
>      - **Proposta (aguardando):** mover "Conexões de WhatsApp" para **depois da produção, junto com a Portal Etapa 3**.
>      - Atenção: a **notificação diária** das escalas não pode usar o modelo Aparelho (o sistema não envia sozinho) → canal a definir no refinamento das escalas (aviso no celular pelo PWA e/ou e-mail).
>
> **Decisão do usuário (2026-10-08): "vamos manter como estamos hoje sem alterar a ordem".**
> - A sequência 1–8 acima fica **como está**, inclusive "Conexões de WhatsApp" no item 3, antes da F8.
> - A tabela de fases **não é renumerada**: a ordem de execução é esta lista.
> - Interpretação registrada e informada ao usuário para correção, se for o caso.
> 4. **F8 Planos, pagamento (Asaas) e integrações**;
> 5. **Painel do Super Admin completo**;
> 6. **Segurança pré-produção** (essencial do OWASP, antecipado da F10, porque o portal abre o sistema a usuários externos) + responsividade do painel admin;
> 7. limpeza dos dados de teste + troca de credenciais → **promoção para PRD**;
> 8. depois do PRD: Portal Etapas 2 e 3, F12 App nas lojas, F9 GLPI, F10 completa, F11 Manual.
>
> Numeração única na tabela a confirmar.

**Princípio:** cada fase é concluída **integralmente** antes de avançar. Validação na URL pública (Vercel) a cada etapa.

---

## 6. ESCOPO DETALHADO DO MVP

O MVP entrega o **sistema operacional completo, multi-tenant, sem a camada comercial**. A Infoxtec é cadastrada manualmente como tenant pelo Super Admin e opera de imediato.

> **Justificativa:** como a Infoxtec é parceira validadora sem cobrança, toda a camada de vendas (planos, pagamento, trial, auto-cadastro) pode ser desenvolvida depois, sem bloquear a entrega do núcleo operacional.

### F2 — Clientes e Locais ✅
Cadastro das empresas atendidas (Cliente) e suas unidades físicas (Local/Unidade). Ex: Cliente "Atakarejo", Local "Loja 01 — Feira de Santana".

### F3 — Ordens de Serviço (Gestor) ✅
O gestor abre a OS, descreve o serviço, define tipo, prioridade e prazo, atribui ao técnico. Acompanha o status (máquina de estados completa).

### F4 — App de Campo (Técnico) ✅
Interface **mobile-first**. O técnico vê as ordens do dia, inicia e encerra atendimentos com registro de data/hora. Responsividade é requisito desde o início.

### F5 — Checklists ✅
Roteiros de verificação **configuráveis**, independentes de serviço específico. Servem para vistoria, validação de ambiente, inspeção ou levantamento. O técnico preenche durante o atendimento, garantindo padronização.

Entregue em duas camadas: checklist **vinculado a uma OS** (o gestor associa um modelo na criação/edição da ordem) e checklist **avulso**, sem OS — vínculo opcional a Cliente/Unidade, atribuível a um ou mais técnicos, com recorrência como etiqueta informativa (ex: "mensal"), acessível numa aba própria no app de campo. Rastreabilidade completa das respostas (histórico versionado por trigger) e evidências fotográficas com compressão já implementadas; carimbo (logo/GPS/data na foto) fica para a F6.

> **Em discussão (2026-09-25) — nome e recorrência do checklist avulso.** Usuário não gostou de "avulso" e esperava recorrência estilo Outlook. Hoje a recorrência é só texto livre (etiqueta), sem gerar ocorrências. Proposta levada ao usuário, aguardando decisão:
> - **Nome:** "Inspeções" (menu e app do técnico), cobrindo única ou recorrente; alternativas "Rotinas", "Checklists programados", "Vistorias"
> - **Recorrência estruturada:** padrão (não se repete / diária / semanal com dias da semana / mensal por dia ou "2ª terça" / anual) + "a cada N", início, término (sem término / após N / até data), prazo para concluir → situação "atrasada"; resumo em texto e prévia das próximas datas
> - **Técnica:** regra guardada no padrão iCalendar (RRULE, o mesmo do Outlook/Google), "série" separada das ocorrências, geração pelo banco (pg_cron diário) só da próxima ocorrência dentro de uma janela; editar "só esta / esta e as seguintes"; pausar série
> - **ENTREGUE em 2026-09-25** (migration 038, testada na URL pública — ver PROJETO_ATOS.md "Recorrência dos checklists avulsos"). Próximo na ordem aprovada: F7 (painel gerencial)
> - **Decisões 2026-09-25:** nome "avulso" mantido por enquanto; recorrência entra antes da F7; UX detalhada (lista de atalhos + "Personalizar..." em modal) e exemplos levados ao usuário, aguardando aprovação
> - **Aprovado 2026-09-25:** UX = campo "Repetir" com atalhos + "Personalizar..." em modal por cima (resumo em texto + próximas 5 datas); fim de semana = só aviso/destaque na prévia (sem mover data automaticamente)
> - **Decidido (Engenharia/PO/UX, delegado pelo usuário) 2026-09-25 — dia 29/30/31 em mês curto:** a ocorrência cai no **último dia do mês** (não pula o mês, como faria o RRULE puro); o resumo avisa "nos meses mais curtos, no último dia". O modal também oferece "no último dia do mês" e "na última <dia da semana>" explícitos
> - **Feriados:** usuário pediu um módulo próprio (feriados, escala, horário de atendimento) como base para ponto, envio de escala e SLA — ver seção 9.8

### F6 — Assinatura Digital, Evidências e Envio 🔄 (EM ANDAMENTO)
**A fase mais rica do MVP.** Definições refinadas:

**Assinatura e PDF**
- Captura de assinatura digital do cliente **via toque na tela** do celular do técnico — **✅ concluído (2026-09-22)**, obrigatoriedade configurável por tenant (Configurações)
- Geração de **relatório PDF** com: dados da OS + checklist preenchido + evidências + assinatura — pendente

**Evidências Fotográficas — ✅ concluído (2026-09-22)**
- Campo para cadastro de evidências em foto na OS — próprio da OS, **independente de ter checklist** (via campo "foto" do checklist também, quando existir um)
- **Carimbo automático** em cada foto: logo e nome da empresa, **localização (GPS)**, data e hora
- Campo de observação aberto, preenchido pelo técnico
- **GPS capturado automaticamente** do dispositivo, nunca digitado — leitura pontual (`getCurrentPosition`, sem `watchPosition`), nunca em segundo plano
- Se o GPS estiver negado/desligado: sistema **avisa e exige ativação** para continuar (bloqueia o anexo)
- **Captura só pela câmera embutida no app (2026-09-23)** — sem escolher foto da galeria, para que o carimbo de data/GPS corresponda de fato ao momento da foto. Motivo técnico adicional: abrir o app de Câmera nativo fazia o Android fechar o navegador em aparelhos com pouca memória
- **Decisão (jul/2026), implementada:** guarda-se **apenas a imagem carimbada** — o original sem carimbo não é armazenado. A coordenada só existe dentro do pixel da foto, nunca gravada separada no banco (reforço de privacidade além do inicialmente decidido)
- Logo da empresa configurável em Configurações (branding por tenant)
- **Carimbo v2 (2026-09-23, modelo enviado pelo usuário, estilo Timemark)** — decisões:
  - Layout padrão: logo em cartão, hora em destaque, data/dia, endereço e coordenadas no canto inferior esquerdo; marca "ATOS · Gestão de Campo" no superior direito
  - Coordenadas **mantidas** em linha pequena (o endereço é o legível; a coordenada é a prova) — desligável na configuração
  - Endereço por geocodificação reversa via Edge Function (provedor trocável). **Começa com Nominatim/OpenStreetMap**; avaliar Google antes do PRD. Usuário quer discutir o tema mais a fundo pensando em SaaS (custo por tenant, cota, cache)
  - **Configuração de campos do carimbo por tenant** (liga/desliga, posições fixas, prévia ao vivo) — Incremento 3
  - Evidência pode ser vista em tela cheia e **baixada** (técnico e admin)
  - ~~Em discussão: marca ATOS removível (white-label) ou fixa; código de verificação de autenticidade~~ **Decidido em 2026-09-23:**
    - **Marca ATOS = selo de autenticidade**, não propaganda ("ATOS Verificado · código"). Fixa e discreta no MVP; **white-label pago na F8** (selo sem o nome ATOS, código continua). Racional: concorrentes de field service (Auvo, Produttivo) põem a marca do CLIENTE no entregável; marca do fornecedor em destaque só funciona como selo com propósito (caso Timemark)
    - **Código de verificação de autenticidade ENTRA no MVP, antes do Bloco C (PDF)** — código aleatório + hash SHA-256 + hora do servidor por foto, página pública `/verificar/CÓDIGO`. Limite honesto: app web não detecta GPS falsificado; garante "não foi alterada depois do envio" + "quem e quando (relógio do servidor)"
    - Endereço no carimbo: só rua/bairro/cidade/UF/CEP (Nominatim erra nome do local e número)
  - **Ordem acordada antes do Bloco C:** (1) carimbo v2 + ver/baixar ✅ → (2) endereço ✅ → (3) configuração de campos do carimbo por tenant → (4) código de verificação → (5) **discussão do provedor de geocodificação para SaaS** (custo por tenant, cota por plano, cache, LGPD/suboperador) → Bloco C (PDF)
- Base construída na F5 (Bloco D): bucket privado `evidencias` isolado por tenant, compressão no navegador (1600px / qualidade 80%), limite de 5MB e URL assinada. O carimbo é aplicado no mesmo canvas da compressão, antes do envio

**Relatório PDF — decisões (2026-09-24)**
- O PDF é **gerado automaticamente quando a OS é concluída** e **guardado** como relatório oficial (o que o cliente recebe = o que fica arquivado), com **código de verificação** próprio, como as fotos. OS reaberta e concluída de novo gera nova versão
- Gerado **no servidor**, não no celular do técnico (lição do bug de memória do Android): o técnico conclui e segue; se a geração falhar, o sistema tenta de novo
- Consequência: o PDF preserva as fotos — o "liberar espaço" pode apagar as fotos originais mantendo o PDF
- **"Liberar espaço" em 2 níveis** (proposta aceita em princípio): (1) fotos originais, mantendo o PDF; (2) fotos + PDFs, exige ZIP antes. Antes de apagar, gera o PDF de OS que não tenham (concluídas antes do recurso ou falha na geração)
- **Nova ordem (2026-09-24):** discussão do provedor de geocodificação para SaaS → Bloco C (PDF) → "liberar espaço"
- **Geocodificação para SaaS — análise (2026-09-24), aguardando decisão:**
  - Google descartado: termos só permitem guardar o resultado por 30 dias (fora de mapa Google) — incompatível com endereço gravado na foto
  - OpenCage: permite guardar para sempre, mas o plano GRATUITO é só para teste (não pode em produção) — pago a partir de US$ 50/mês
  - **LocationIQ: plano gratuito PERMITE uso comercial em produção** (5.000 consultas/dia), desde que haja link visível "Search by LocationIQ.com" no app; o endereço pode ser guardado para sempre; o cache para reaproveitar consultas é limitado a 48h no gratuito (ilimitado no pago, a partir de US$ 49/mês)
  - Recomendação: LocationIQ gratuito no PRD até ~5.000 consultas/dia; migrar para o pago quando o volume crescer
  - **Troca de provedor pelo Super Admin (proposta 2026-09-24):** tela da plataforma onde o Super Admin escolhe o provedor (Nominatim / LocationIQ / OpenCage), cola a chave da API, clica em "Testar" e ativa — sem deploy. Requisitos: um adaptador por provedor na Edge Function (formato de resposta diferente → mesmo formato de endereço no carimbo); chave guardada só no servidor (nunca visível no navegador); contador de consultas do mês para acompanhar o limite

**Envio da OS**
- **Envio opcional** — o técnico decide se envia ao cliente
- **Sem cadastro prévio de contato:** WhatsApp ou e-mail digitado no momento do envio
- WhatsApp disparado **pelo número da empresa** (instância Z-API/Evolution configurada **por tenant**)
- E-mail enviado do **remetente próprio de cada empresa** (SMTP configurável por tenant)

> **Refinamento (set/2026) — pendente de detalhamento técnico antes do Bloco D:** por ser SaaS multi-tenant, WhatsApp não pode ser uma credencial fixa da VLUMA. Cada tenant precisa de um **painel próprio de configuração** onde: (1) insere seus dados (remetente de e-mail/SMTP), (2) conecta sua **própria instância WhatsApp** via **leitura de QR Code** (fluxo de criação de instância + pareamento da Evolution API), e (3) **liga/desliga o canal WhatsApp** conforme o negócio dele precisa (nem todo cliente vai querer usar). Ou seja: o canal de envio é **configurável e opcional por tenant**, não um toggle binário só de "permitir/bloquear" do Admin VLUMA — isso é adicional ao controle de bloqueio já descrito abaixo, não substitui. Detalhar esse fluxo (gestão de instâncias Evolution multi-tenant, onde ficam as credenciais, reconexão se cair) antes de iniciar o Bloco D.

**Envio do relatório — decisões (2026-09-24)**
- **Pesquisa que mudou o desenho**: WhatsApp não oficial (Evolution/Z-API/Baileys) viola os termos do WhatsApp — número banido em 2–8 semanas, sem recurso → **não usar** (risco é do número do cliente e da reputação VLUMA). Supabase Edge Functions bloqueiam SMTP nas portas 25/587 — só **465 (SSL)**
- **Três opções de envio, liberadas conforme o PLANO** (ideia do usuário): 
  1. **Básico** — WhatsApp pelo **aparelho** (botão abre o WhatsApp do celular com mensagem pronta + link do relatório; sem API, sem conta, sem risco de banimento) + e-mail enviado pela plataforma: **"Empresa via ATOS" <noreply@vluma.com.br>**, com "Responder para" = e-mail de contato da empresa, PDF anexado + link de verificação
  2. **Intermediário** — + **e-mail próprio** da empresa (SMTP do cliente, porta 465, senha no cofre do servidor, botão "Testar envio")
  3. **Avançado** — + **WhatsApp oficial (Cloud API da Meta)** automático pelo número da empresa (exige verificação da empresa na Meta e modelos aprovados; custo por mensagem)
  - Enquanto a F8 (planos) não existe, o **Super Admin libera por empresa** quais opções ela pode usar; a F8 só passa a ligar isso ao plano
- **Configurações da empresa ("Envio do relatório")**: canais ligados/desligados, mensagem padrão editável ({cliente}, {os}, {empresa}, {link}), quem pode enviar (Bloco E: empresa toda / técnicos escolhidos; gestor sempre pode), e-mail próprio (se o plano permitir)
- Registro do envio na linha do tempo com **destino mascarado** (LGPD)
- Remetente padrão: noreply@vluma.com.br (Zoho), credencial só em segredo do servidor
- **Nível Avançado — Evolution (decisão do usuário, 2026-09-24):** o usuário já tem a Evolution API instalada na VPS dele; quando formos configurar, refinar juntos: criação da instância e leitura do QR Code **pela tela do ATOS** (por empresa), reconexão, onde ficam URL/chave da Evolution. Manter no desenho o **aviso de risco** levantado na pesquisa (API não oficial → risco de banimento do número) — opção consciente do cliente
- **Nível Avançado — desenho APROVADO pelo usuário (2026-09-24), NÃO desenvolvido ainda** (usuário vai primeiro testar Blocos D/E; a forma de oferecer — Evolution, API oficial ou as duas, e em que plano — será decidida na discussão de planos):
  1. **Plataforma (Super Admin)**: seção "Plataforma — WhatsApp (Evolution)" em Configurações, no padrão da geocodificação — URL da Evolution (HTTPS) + chave global (`AUTHENTICATION_API_KEY`, só no servidor) + "Testar conexão" (mostra a versão) + consumo de mensagens por empresa
  2. **Cada empresa conecta o próprio número pela tela do ATOS** (admin, em Configurações → Envio do relatório → WhatsApp automático): aceite do **aviso de risco** ("API não oficial: o número pode ser bloqueado pelo WhatsApp", registrado com quem/quando) → "Conectar WhatsApp" cria instância exclusiva da empresa na Evolution (`POST /instance/create`, `WHATSAPP-BAILEYS`, qrcode) → QR Code na tela → estado detectado sozinho (`GET /instance/connectionState/{nome}`) → "✅ Conectado: (71) 9xxxx-xxxx"; "Desconectar" (`/instance/logout`) e "Reconectar" (`GET /instance/connect/{nome}`, novo QR)
  3. **Envio**: "Enviar por WhatsApp" na OS concluída passa a enviar SOZINHO pelo número da empresa, com o PDF anexado (`POST /message/sendMedia/{nome}`, documento) e a mensagem padrão; se a instância estiver desconectada, **volta para o modo aparelho** e avisa o admin
  4. **Redução de risco de bloqueio**: só para números digitados em OS concluída, nunca em massa, intervalo mínimo entre mensagens
  5. **Dados pendentes do usuário** para construir: URL pública da Evolution (HTTPS), chave global e versão (endpoints mudam entre v1/v2; há relato de problema no QR em algumas 2.2.x — issue #2380 da Evolution). Chave entra na lista de credenciais a trocar no fim do MVP
- **API oficial (Meta)** — levantado em 2026-09-24, não configurada nem construída: exige Business Manager + verificação da empresa, número dedicado, app na Meta for Developers, modelo de mensagem aprovado; para SaaS, VLUMA como "Tech Provider" com "Embedded Signup" (botão "Conectar WhatsApp" no ATOS). Decisão de como oferecer fica para a discussão de planos

**Painel do Gestor — Disparo Manual**
- Gestor dispara WhatsApp informando o número na hora
- Gestor envia e-mail (destinatário, assunto, texto) **anexando uma ou várias OS**

**Controle de Envio pelo Admin**
- **Bloqueio global:** Admin desliga o envio para todo o tenant
- **Bloqueio por técnico:** Admin define quais técnicos podem enviar OS

### F7 — Painel Gerencial ✅
> **ENTREGUE e VALIDADA pelo usuário em 2026-10-02** (migrations 046–047; ver PROJETO_ATOS.md "F7 — Painel gerencial"): painel no Dashboard para admin/gestor com Agora (tempo real, clicável até a lista filtrada), Desempenho do período vs anterior (% SLA × meta configurável, concluídas, tempo até atendimento, tempo de solução, 1ª visita), Evolução, Idade do backlog, Equipe, Clientes, Reincidência, Preventivas e Comprovação. Filtros de período, cliente, técnico e categoria. Técnico sem painel (decisão do usuário).
> **Refinamento 2026-09-25 (em discussão):** técnico **não** ganha painel próprio — a visão atual do app de campo basta (decisão do usuário), com acesso restrito às próprias OS/checklists já garantido no banco (migrations 042/043). Painel é do gestor/admin. Proposta de KPIs levada ao usuário (situação/backlog, atrasos, concluídas no período com comparação, tempo médio em horas úteis, produtividade e carga por técnico, ranking e **reincidência** por cliente/unidade, evolução, checklists no prazo e **comprovação do serviço** — % com assinatura, foto e relatório enviado). Pergunta do usuário: criar o painel sem o SLA? Recomendação: **SLA v1 antes da F7** (a base de horas úteis já existe), para o painel nascer com "no prazo / em risco / vencido" — aguardando decisão
Indicadores da operação: OS abertas / em andamento / concluídas, **produtividade por técnico**, **tempo médio de atendimento**, OS por cliente.

### SLA no padrão ITSM + KPIs do painel — proposta para refinamento (2026-09-25)
Pedido do usuário: refinamento completo (painel de configuração de criticidade/categoria × SLA, padrões ITSM) e KPIs pensados para **N empresas de vários segmentos**, com a melhor experiência. Ordem sugerida: **SLA antes da F7** (aguardando decisão).

**Decisões do usuário (2026-09-25) sobre a proposta abaixo:**
1. Tipos de OS: **Incidente, Requisição, Preventiva, Visita** (sem "Instalação")
2. Prioridade pela matriz Impacto × Urgência, com nomes **Crítico, Alto, Baixo**; **"Requisição"** é um nível próprio, usado só nos tipos Requisição e Visita
3. Metas de SLA — usuário não entendeu; reexplicado com exemplo, aguardando
4. Pausas com motivos configuráveis e agendamento a pedido do cliente como novo prazo — **aprovado, construir e testar**
5. "Em risco" a 75% e justificativa obrigatória — usuário não entendeu; reexplicado, aguardando
6. **Sem modelos por segmento**: é produto; cada empresa cria o próprio catálogo de serviços
7. SLA por cliente/contrato: **construir**, com possibilidade de bloqueio por plano quando falarmos de venda/planos (F8)
8. KPIs e tela do painel: **aprovados** — construir e validar
- Cuidado pedido pelo usuário: a OS atual muda — **não quebrar o que já funciona e foi testado**
- **Respostas finais (2026-09-25):** (3) metas por nível = horas para **iniciar** (atendimento) e para **concluir** (solução), **resposta opcional** — e **a própria empresa configura** (admin/gestor); (5) **alerta "em risco"** sim (padrão 75%, ajustável); **sem justificativa obrigatória** ao estourar; OS antigas: não se preocupar (ambiente de desenvolvimento); (4) níveis por tipo: **Incidente → Crítico/Alto/Baixo** (matriz Impacto × Urgência ou modo simples), **Preventiva → nível "Preventiva"**, **Requisição → nível "Requisição"**, **Visita → sem SLA**
- Entrega: (A) banco + tela "Catálogo e SLA" → (B) OS (formulário, lista, detalhe, app do técnico, pausa, agendamento, PDF) com regressão completa → (C) alertas de em risco/vencido → F7
- **A, B e C ENTREGUES em 2026-09-28** (migrations 044–045, testadas na URL pública — ver PROJETO_ATOS.md). Próximo: **F7 (painel gerencial)** com os KPIs aprovados — **F7 entregue em 2026-10-02**

**Modelo ITSM (ITIL, simplificado para PME de campo):**
- **Tipo de OS**: Corretiva (incidente) · Preventiva (planejada — liga com checklists recorrentes) · Instalação/Requisição · Visita técnica/Orçamento
- **Catálogo por empresa**: Categoria → Subcategoria (ex.: CFTV › Câmera sem imagem), com **modelos prontos por segmento** (CFTV/segurança, redes/TI, manutenção predial, climatização, elétrica) escolhidos na configuração inicial e editáveis
- **Prioridade pela matriz Impacto × Urgência** → P1 Crítica, P2 Alta, P3 Média, P4 Baixa; a categoria sugere impacto/urgência; **modo simples** opcional (escolhe a prioridade direto). Atuais: urgente→P1, alta→P2, normal→P3
- **Metas de SLA**: Resposta (até atribuir/primeiro contato, opcional) · **Atendimento** (até o técnico iniciar no local) · **Solução** (até concluir), em horas úteis do **horário de atendimento** escolhido na política (módulo Calendários: ex. P1 24x7, demais Comercial) e feriados da cidade da unidade
- **Hierarquia de políticas** (a mais específica vence): Cliente + Categoria → Cliente (contrato) → Categoria → Prioridade (padrão)
- **Relógio**: pausas com **motivos configuráveis** que param ou não o SLA (ex.: "aguardando cliente" para; "falta de peça nossa" não); **agendamento a pedido do cliente** vira o novo prazo acordado; troca de prioridade/categoria recalcula a partir da abertura e registra na linha do tempo
- **Estados**: No prazo · Em risco (≥ 75% consumido, configurável) · Vencido → ao concluir: Cumprido / Violado, com **justificativa obrigatória** da violação (causa, vira indicador)
- **Alertas e escalonamento**: aviso no app a 75% e 100% para gestor (depois WhatsApp/e-mail, junto da notificação diária)
- **Tela de configuração** (menu próprio "Catálogo e SLA"): assistente inicial por segmento; abas Categorias · Prioridades (matriz) · Políticas de SLA · Motivos de pausa · Contratos de clientes; prévia "uma OS P2 aberta hoje às 16h vence em…"
- **Na operação**: formulário da OS sugere prioridade pela categoria e mostra "Atendimento até… · Solução até…"; lista de OS com coluna/filtro de SLA e **abre em "Em aberto" ordenada pelo vencimento** (resolve a pendência do padrão da lista); app do técnico ordena por vencimento com selo "vence em 2 h"

**KPIs do painel (valem para qualquer segmento — medem OS/SLA, não o tipo de serviço):**
- **Agora** (tempo real, clicáveis → lista filtrada): Vencidos · Em risco · Sem técnico · Preventivas atrasadas · P1/P2 em aberto
- **Desempenho do período** (com meta e variação vs período anterior): **% SLA cumprido** (indicador principal, meta configurável) · Concluídas · **MTTA** (tempo médio até atendimento) · **MTTR** (tempo médio de solução, horas úteis) · **Resolução na 1ª visita** (sem reabertura/nova OS da mesma unidade e categoria em 30 dias) · Idade do backlog (0–2, 3–7, 8–15, >15 dias)
- **Equipe**: por técnico — carga atual, concluídas, % SLA, MTTR, 1ª visita
- **Clientes**: volume, % SLA e reincidência por cliente/unidade (base de um futuro **relatório mensal de SLA por cliente**)
- **Preventivas**: % do plano cumprido no prazo; corretivas × preventivas (maturidade da manutenção)
- **Comprovação do serviço** (diferencial ATOS): % com assinatura do cliente, com foto, com relatório enviado
- Depois (backlog): satisfação do cliente (CSAT) em 1 clique no relatório enviado; painel personalizável

**UX do painel**: filtros no topo (período "Este mês", cliente, técnico, categoria); faixa "Agora" primeiro; cada número com contexto (meta, variação, tendência); cor só para situação; tudo clicável até a lista; um gráfico de evolução (abertas × concluídas + linha de % SLA) e barras de idade do backlog; tabelas curtas de equipe e clientes; celular empilha na mesma ordem; estados vazios que ensinam (ex.: "sem preventivas — configure uma recorrência")

### LGPD no MVP (obrigatório — não é pós-MVP)
Como a captura de GPS envolve dados de localização:
- **Termo de consentimento** de uso de localização, aceito no primeiro acesso do técnico
- **Aviso de privacidade** acessível no sistema
- **Garantia técnica de não-rastreamento:** GPS lido **apenas no momento da foto** (sob demanda) — sem leitura contínua, sem histórico de trajeto, sem armazenar posição fora do contexto da evidência
- A coordenada é vinculada **exclusivamente à evidência fotográfica**, nunca como "posição do técnico"
- Tratamento mínimo dos dados de contato do cliente final (WhatsApp/e-mail), só para a finalidade do envio

> **Distinção jurídica:** no modelo multi-tenant, a **VLUMA é operadora** dos dados e **cada empresa cliente é a controladora**, responsável pelos dados que insere e pelo uso conforme a lei.

---

## 7. MODELO DE VENDAS (F8 — Backlog)

Modelo comercial **já definido em detalhe**. Todas as configurações são editáveis pelo Super Admin (valores de fábrica).

### Base de cobrança
- **Cobrança por técnico (assento)**, em modelo **híbrido**
- **Duplo limite por plano:** faixa de técnicos **E** teto de OS/mês
- **Gateway:** Asaas

### Planos iniciais (editáveis pelo Super Admin)

| Plano | Técnicos | OS / mês | Preço |
|-------|----------|----------|-------|
| **Pequena** | até 20 | 300 | **R$ 149/mês** |
| **Média** | 20 a 50 | 800 | **R$ 349/mês** |
| **Grande** | 50+ | ilimitado | sob consulta |

> Valores calibrados com benchmark do mercado nacional de field service. São ponto de partida, alteráveis a qualquer momento.

### Comportamento no limite
- **Bloqueio suave** ao atingir o limite de técnicos ou de OS
- **Add-on temporário:** compra de técnicos e/ou OS adicionais avulsos
- O add-on dura até o **fim do ciclo vigente**, reiniciando no mês seguinte

### Trial
- **7 dias grátis**
- **Sem cartão no cadastro** — o usuário cadastra e usa direto
- Cartão só é pedido quando o cliente **decide comprar** um plano ou add-on

### Super Admin — Gestão Comercial
- Painel de planos (criar/editar/remover, com preço, faixa de técnicos e teto de OS)
- **Override por cliente:** aumentar limites de um tenant manualmente e **sem cobrança**, sobrepondo o plano (cortesia, negociação, cliente estratégico)

---

### 7.1. Custos variáveis da plataforma — para discutir na definição dos planos (registrado em 2026-09-24)

> Levantamento para calibrar preço e limites dos planos. Valores aproximados, **confirmar nos sites oficiais antes de contratar**.

| Item | Como cresce | Opção gratuita | Custo quando cresce | Observações |
|------|-------------|----------------|---------------------|-------------|
| **Endereço no carimbo (geocodificação)** | 1 consulta por foto (menos com cache do mesmo local) | LocationIQ: 5.000/dia, uso comercial com link "Search by LocationIQ.com"; cache de 48h | LocationIQ pago: a partir de US$ 49/mês (cache ilimitado); OpenCage: a partir de US$ 50/mês (10 mil/dia) — gratuito dele é só teste | Google descartado: não permite guardar o endereço para sempre. Estimativa: Infoxtec ~100 consultas/dia; limite gratuito ≈ 150 empresas desse porte |
| **Armazenamento de fotos e PDFs (Supabase Storage)** | ~130–170 KB por foto + miniatura ~15 KB; PDF ~0,6–0,9 MB por OS | Supabase Free: 1 GB por projeto (todas as empresas) | Supabase Pro: US$ 25/mês com 100 GB incluídos; excedente barato por GB | Estimativa: Infoxtec (300 OS × 10 fotos/mês) ≈ 0,5–0,9 GB/mês → o Free não sustenta operação real. "Liberar espaço" e política de retenção por plano reduzem |
| **Tráfego de saída (egress)** | Cada foto/PDF visualizado ou baixado | Incluído no plano Supabase (cota mensal) | Cobrado por GB acima da cota | Miniaturas nas listas já reduzem ~90% do tráfego das listas; exportação ZIP e PDFs consomem |
| **Geração de PDF (Edge Function)** | 1 execução por OS concluída | Cota mensal de execuções no plano Supabase | Por milhão de execuções acima da cota | Baixo impacto esperado |
| **WhatsApp (Evolution API, Bloco D)** | Por empresa (instância própria) | — | Servidor da Evolution (hospedagem própria) | A detalhar no Bloco D |
| **E-mail (SMTP por empresa, Bloco D)** | Por envio | SMTP do próprio cliente | — | A detalhar no Bloco D |

**Alavancas para os planos:** política de retenção de fotos por plano (ex.: 12/24 meses), cota de armazenamento por empresa (já medida em Configurações → Armazenamento), endereço no carimbo incluso em todos os planos (custo de centavos por empresa).

## 8. BACKLOG — DEFINIÇÕES JÁ ACORDADAS

### 8.1. Cadastro e Captação
- **Fluxo de auto-cadastro (self-service)**, padrão Plugado, com "Cadastre-se" na tela de login
- **Landing page** para captação e conversão
- **Onboarding do tenant:** do cadastro ao primeiro uso

> **Decisão (2026-09-24) — consulta de CNPJ na Receita já existe e DEVE ser reusada na contratação SaaS:** `src/lib/cnpj.ts` (`consultarCnpjReceita`, via BrasilAPI — gratuita, sem chave) devolve razão social, nome fantasia, **situação cadastral** (ATIVA/BAIXADA/INAPTA/SUSPENSA), município/UF e telefone. Hoje o Super Admin usa em Empresas → "Identidade legal". No auto-cadastro (F8): preencher razão social automaticamente a partir do CNPJ, **bloquear CNPJ não ATIVO**, trava de CNPJ duplicado (uma empresa = um trial) e sugerir o nome fantasia como nome de exibição. Razão social e CNPJ continuam **fora do alcance do admin** depois do cadastro (identidade legal = contratante/cobrança).

### 8.2. Anti-fraude e Segurança
- Trava de **cadastro duplicado** por e-mail, CPF ou CNPJ (uma empresa = um trial)
- **Validação de CPF/CNPJ:** formato + dígito verificador, com consulta opcional à Receita
- **Sessão única por técnico:** um login ativo por vez (impede compartilhar credenciais)

### 8.3. Integrações e Fases Futuras
- Recorrência **anual com desconto** (além da mensal)
- **Integração GLPI (F9):** abertura automática de ticket + fechamento na normalização, configurável por tenant
- **OWASP (F10):** testes de segurança multi-tenant
- **Manual (F11):** por perfil de acesso + documentação técnica
- **Orçamento como opção da OS** (backlog — decisão do usuário em 2026-10-10): disponível dentro da OS: **todo Incidente e toda Requisição terá a opção de gerar orçamento, tenham ou não sido gerados por uma Visita** (esclarecimento do usuário em 2026-10-10); integração ou reaproveitamento do sistema de orçamento que o usuário já possui; detalhes e perguntas abertas na seção 9.1 (E5, "ORÇAMENTO — radar").

### 8.4. Jurídico
- **Contrato VLUMA ↔ clientes**, estabelecendo relação **operador/controlador** de dados, resguardando a VLUMA caso o cliente aja em desacordo com as leis de proteção de dados. **Sujeito a revisão por advogado (OAB).**

---

## 9. PONTOS ESTRUTURAIS LEVANTADOS (a discutir e priorizar)

> Levantados em jul/2026. Registrados aqui para não se perderem. **Ainda não priorizados.**

### 9.1. Portal de abertura de chamado para os clientes dos nossos clientes
O **cliente final** (ex: Atakarejo) abre chamados, acompanha e comenta pelo portal.
- Herda a visão do Operax: **dois níveis de dashboard**
  - **Nível 1** — empresa contratante (Infoxtec): gestão completa
  - **Nível 2** — cliente final (Atakarejo): portal só-visualização, com branding do contratante
- **Acesso por ambos:** URL genérica (`app.vluma.com.br/atakarejo`) **e** subdomínio próprio (`soundreport.infoxtec.com.br`)
- **Subdomínio customizado = ADD-ON PAGO**
- Impacto: solicitante vira **tipo de usuário**; muda modelo de dados e camada de acesso
- **Retomado pelo usuário em 2026-10-02 (antes das escalas), aguardando decisão.** Desenho do usuário:
  - **Supervisor** (do cliente): vê todos os chamados do cliente, painel com os principais KPIs, cria usuários e equipes
  - **Usuário**: vê os próprios chamados e os da sua equipe, com KPIs básicos
- **Parecer levado ao usuário (Engenheiro/PO/UX), 2026-10-02:** desenho aprovado na essência. Propostas:
  - chamado do portal vira OS direto ("origem: portal", sem técnico), e a empresa classifica tipo, categoria e prioridade
  - o cliente informa só "problema ou solicitação", categoria do catálogo marcada como visível no portal e um impacto em linguagem simples
  - o SLA de **resposta** mede a triagem
  - comentários **públicos × internos**
  - status em linguagem do cliente; "Aguardando você" ligado ao motivo de pausa "Aguardando o cliente", que retoma quando o cliente responde
  - confirmação da solução, reabertura e nota de satisfação (CSAT)
  - convite por e-mail (o supervisor não define senha)
  - equipe = grupo de pessoas, com unidades opcionais
  - a empresa liga o portal por cliente e convida o 1º supervisor
  - limites por plano (F8)
  - experiência separada do painel interno, celular primeiro, com a marca da empresa
  - **risco técnico principal:** as policies atuais filtram só por empresa (tenant), então um usuário do portal veria tudo. Exige papel próprio, auditoria de todas as policies e funções e teste de personificação tabela por tabela
  - entrega em 3 etapas
  - perguntas em aberto: equipe × unidade; o cliente vê SLA?; CSAT na etapa 1?; o portal entra antes do PRD?
- **Respostas do usuário ao parecer (2026-10-02)** — o refinamento é feito **um ponto por vez**, só avançando com a resposta dele:
  - **WhatsApp**: discordou do meu argumento de que o portal "tira o chamado do WhatsApp". O WhatsApp é um canal consolidado, com os 3 modelos de conexão a refinar (F6), e abertura por telefone nunca foi cogitada. **O portal é um canal ao lado do WhatsApp, não substituto.**
  - **Prioridade**: o usuário do portal **pode e deve escolher a prioridade** (o ITIL permite). O chamado nasce sem técnico e **sem grupo**, e a equipe de **N1** reclassifica → a refinar (o ATOS ainda não tem grupos/filas internos).
  - **Tipos**: deixar **todas as opções** no portal (ex.: uma assistência técnica cujos clientes pedem visita) → a refinar.
  - **Impacto em linguagem simples**: o usuário não entendeu → a refinar.
  - De acordo: valor para retenção, categorias visíveis no portal, comentário público × interno.
  - **Ponto que faltou no parecer** (apontado pelo usuário): **um portal de atendimento para cada empresa que contrata a VLUMA**.
- **Pauta do refinamento (ordem proposta):**
  1. portal por empresa (endereço, identidade, ativação)
  2. canais (portal + WhatsApp)
  3. abertura, prioridade e N1/grupos
  4. tipos no portal
  5. impacto
  6. perfis e equipes
  7. "aguardando você", fechamento e satisfação
  8. SLA visível ao cliente
  9. telas e KPIs
  10. segurança e dados
  11. etapas e posição no roadmap
- **Ponto 1 — portal por empresa (respostas de 2026-10-04):**
  - **Endereço**: deixar o ambiente **preparado para as 3 opções**:
    - (A) caminho no domínio da VLUMA, ex. `/infoxtec`;
    - (B) subdomínio da VLUMA;
    - (C) domínio próprio da empresa.

    Uma tabela de endereços do portal resolve qual empresa abrir. A opção B só exige DNS curinga quando for ligada. Ainda falta definir o domínio da VLUMA.
  - **Identidade** (logo, nome do portal, cor, boas-vindas, contatos com WhatsApp, rodapé "Tecnologia ATOS"): **OK**, ajustável quando necessário.
  - **Mesma pessoa em vários portais**: tratar já, se não onerar.
    - Avaliação: custo pequeno. O vínculo pessoa ↔ cliente já é necessário de qualquer forma; virar N vínculos quase não muda.
    - O acesso continua checado linha a linha contra os vínculos da própria pessoa.
    - Acréscimos: o convite para quem já tem conta não cria nova senha; o portal aberto pelo endereço mostra só os dados daquela empresa; uma pessoa com mais de um cliente na mesma empresa escolhe "abrindo chamado para".
    - Recomendação: **entra na Etapa 1** — aguardando confirmação.
  - **Um endereço por empresa × por cliente final**: o usuário não entendeu → reexplicado com exemplo, aguardando.
  - **Decisões de 2026-10-04:**
    - **um endereço único por empresa** para todos os clientes dela, com o cliente final reconhecido pelo login;
    - **mesma pessoa em vários portais entra na Etapa 1**;
    - endereço padrão = **subdomínio da VLUMA**, no formato proposto pelo usuário `atendimento.<empresa>.vluma.com.br`;
    - **domínio próprio** à escolha da empresa (opção C).
  - **Nota técnica levada ao usuário (aguardando):** o formato `atendimento.<empresa>.vluma.com.br` tem dois níveis, e um certificado curinga não o cobre. Cada empresa ativada exige criar um registro de DNS e cadastrar o domínio na Vercel. Isso é automatizável se o DNS da VLUMA tiver API; se não, é um passo manual da VLUMA a cada empresa.
    - A alternativa `<empresa>.atendimento.vluma.com.br` é configurada **uma vez**: o subdomínio é delegado à Vercel e o e-mail Zoho não é tocado. A ativação fica automática, o que é necessário para o auto-cadastro do backlog.
    - Nos dois formatos: lista de nomes reservados (app, www, mail, api…).
    - A opção A (caminho `/empresa`) fica só como recurso interno de teste e contingência.
  - **2026-10-08:** o DNS da vluma.com.br está na **Cloudflare**, que tem API, então a ativação fica automática nos dois formatos e o argumento técnico deixa de existir. O usuário pediu uma sugestão de produto.
    - **Recomendação do PO: manter o formato do usuário**, `atendimento.<empresa>.vluma.com.br`:
      - lê-se naturalmente ("atendimento Infoxtec");
      - cria o **espaço da empresa** `<empresa>.vluma.com.br` para o ecossistema (Clarezza e módulos futuros, cada produto com um prefixo);
      - o domínio próprio segue o mesmo padrão, sem o ".vluma" (`atendimento.infoxtec.com.br`): o upgrade é "tirar o vluma".
    - **Nome curto:** escolhido na ativação a partir do nome fantasia; minúsculas, sem acento, 3–30 caracteres, nomes reservados; se trocar, o endereço antigo redireciona por um período.
    - **Engenharia:** registro de DNS "somente DNS" (sem o proxy laranja) + domínio cadastrado na Vercel por API, com certificado automático. Na implementação, precisa de um token da Cloudflare restrito à zona vluma.com.br e de um token da Vercel.
    - Aguardando confirmação para fechar o ponto 1.
  - **Pergunta do usuário (2026-10-08): quem configura o domínio próprio, o admin da empresa ou o Super Admin?**
    - **Recomendação: o próprio admin da empresa (autoatendimento), quando o plano incluir o adicional.** O Super Admin habilita o adicional, acompanha e pode agir pela empresa.
    - **Fluxo:**
      - o admin digita o endereço (ex.: `atendimento.infoxtec.com.br`);
      - o sistema mostra o registro a criar no DNS da empresa, com instruções para os provedores comuns (Registro.br, Cloudflare, Hostinger, GoDaddy) e o botão "Verificar";
      - situação visível: Aguardando DNS → Verificando → Ativo;
      - o subdomínio VLUMA continua funcionando e passa a redirecionar para o domínio próprio;
      - botão "Pedir ajuda à VLUMA", que avisa o Super Admin.
    - **Super Admin:** lista de domínios próprios com a situação, configurar ou remover em nome da empresa.
    - **Engenharia:** cadastro e verificação pela API da Vercel. Antes do PRD, conferir os limites de domínios do plano da Vercel (entra na conversa de custos da F8).
- ✅ **PONTO 1 FECHADO — confirmado pelo usuário em 2026-10-08.** Resumo do combinado:
  1. **Um portal de atendimento por empresa** que contrata a VLUMA, com **um único endereço para todos os clientes dela**; o cliente final é reconhecido pelo login.
  2. **Endereço padrão** = subdomínio VLUMA **`atendimento.<empresa>.vluma.com.br`**, criado automaticamente na ativação.
     - Cloudflare API: registro "somente DNS"; Vercel API: domínio com certificado automático.
     - Cria o "espaço da empresa" `<empresa>.vluma.com.br` para o ecossistema.
  3. **Domínio próprio** (ex.: `atendimento.infoxtec.com.br`) = **adicional pago**, em **autoatendimento pelo admin da empresa**.
     - Configurações › Portal: digita o endereço → o sistema mostra o registro de DNS, com instruções para os provedores comuns → "Verificar" → Aguardando DNS / Verificando / Ativo.
     - O subdomínio VLUMA redireciona para o domínio próprio.
     - Botão "Pedir ajuda à VLUMA".
     - **Super Admin:** libera o adicional, lista os domínios com a situação, configura ou remove em nome da empresa.
  4. **Ambiente preparado para as 3 opções**: caminho `/empresa` (só interno: teste e contingência), subdomínio VLUMA e domínio próprio. Uma tabela de endereços resolve a empresa.
  5. **Nome curto:** sugerido do nome fantasia e ajustável; minúsculas, sem acento, 3–30 caracteres; nomes reservados (app, www, mail, api, admin…); se trocar, o antigo redireciona por um período.
  6. **Identidade do portal:** logo, nome do portal, cor principal, boas-vindas, contatos (com o WhatsApp da empresa), rodapé "Tecnologia ATOS · VLUMA". Ajustável quando necessário.
  7. **Ativação em dois níveis:** o Super Admin habilita o portal (plano F8); a empresa configura e escolhe quais clientes têm acesso.
  8. **Mesma pessoa em vários portais já na Etapa 1:** N vínculos por pessoa; convite para quem já tem conta sem nova senha; cada portal mostra só os dados da sua empresa; "Abrindo chamado para" quando a pessoa tiver mais de um cliente na mesma empresa.
  9. **Para construir:** token da Cloudflare restrito à zona vluma.com.br e token da Vercel (segredos, nunca no git; trocar no fim do MVP). Conferir os limites de domínios do plano da Vercel antes do PRD.
  - **Construção:** só depois de refinados todos os pontos e decidida a posição no roadmap (ponto 11). Nada construído ainda.
- **Ponto 2 — canais (portal + WhatsApp): proposta levada em 2026-10-08, aguardando.**
  - O portal **não substitui** o WhatsApp. Os dois alimentam a mesma OS, com o campo **origem** (portal / WhatsApp / e-mail / interno) e o KPI "chamados por canal".
  - Os 3 modelos de conexão do WhatsApp (F6): aparelho, Evolution, API oficial da Meta.
  - **Etapa 1:**
    - no portal, botão "Falar pelo WhatsApp" com o número do chamado na mensagem;
    - na OS, "Avisar pelo WhatsApp" com mensagem pronta e link do chamado;
    - o gestor registra o chamado recebido no WhatsApp em nome do solicitante (origem WhatsApp), e ele passa a aparecer no portal do cliente;
    - avisos automáticos por e-mail.
  - **Com Evolution ou API oficial ligada:** avisos automáticos de situação pelo WhatsApp.
  - **Etapa 3:** abertura automática por WhatsApp (o número identifica o solicitante; as respostas viram comentários públicos).
  - O solicitante escolhe por onde quer ser avisado.
  - **Respostas do usuário (2026-10-08):**
    1. Portal e WhatsApp alimentando a mesma OS, com a origem registrada: **OK**.
    2. Divisão por etapas: **OK**, mas a **abertura pelo WhatsApp precisa ser mais refinada**. O usuário perguntou se usaríamos o **n8n**.
    3. **Canal dos avisos — decisão:** a **empresa libera os canais** e o **usuário escolhe entre os liberados**. Se ele tentar um canal não liberado, recebe: "A <nome da empresa> não disponibiliza este tipo de comunicação no momento". **Termo de aceite do usuário** para essas comunicações: garantir a LGPD.
  - **Proposta levada (2026-10-08), aguardando:**
    - **Abertura pelo WhatsApp nativa no ATOS**: a Evolution ou a Meta avisam uma Edge Function, que aplica as mesmas regras do portal (empresa, permissões, aceite, auditoria), versionada e testada como o resto.
    - **n8n não no núcleo**, por quatro motivos: mais um componente a operar e proteger; regra de negócio fora do código versionado; isolamento entre empresas feito à mão; e a licença do n8n para uso dentro de produto vendido a terceiros com credenciais dos clientes precisa ser verificada (possível exigência de licença "Embed").
    - **n8n como integração opcional para a empresa** (o ATOS emite avisos de eventos e oferece API) — futuro.
    - **Fluxo da conversa:**
      - a empresa é identificada pelo número que recebeu a mensagem;
      - o solicitante é identificado pelo celular cadastrado e confirmado; número desconhecido recebe orientação + link do portal, e o gestor é avisado (sem OS automática);
      - menu: novo chamado / acompanhar chamado aberto / falar com atendente;
      - novo chamado: assunto (categorias do portal) → unidade (se houver mais de uma) → descrição (texto, foto, áudio) → prioridade (conforme o ponto 3) → confirmação → OS com origem WhatsApp + número e link;
      - mensagens seguintes viram comentário público, e anexos viram anexos;
      - fora do horário de atendimento (Calendários), avisa o horário;
      - "falar com atendente" pausa o robô naquela conversa;
      - primeiro contato pede o aceite.
    - **LGPD:**
      - aceite **versionado e registrado** (texto, versão, data, canal), no padrão do consentimento de localização já existente;
      - retirada a qualquer momento ("SAIR" no WhatsApp, link no e-mail, preferências no portal);
      - só comunicações de serviço (sem marketing);
      - papéis: a empresa é a controladora e a VLUMA a operadora;
      - textos a validar com o jurídico.
  - **Respostas do usuário (2026-10-08):**
    1. **Abertura nativa no ATOS**, com o n8n como integração opcional futura: **OK**.
    2. **"Falar com um atendente" configurável pela empresa**, em 3 modos (nem toda empresa tem atendimento humano):
       - **Desativado:** a opção não aparece no menu.
       - **Ativado → atendente:** encaminha para um atendente humano, e o robô pausa naquela conversa.
       - **Ativado → contatos:** mostra uma mensagem com as formas de contato (e-mail, telefone etc.).
    3. **Número desconhecido:** só orienta e envia os contatos para pedir acesso, sem abrir chamado.
       - Esclarecimento levado ao usuário (aguardando): o número desconhecido não permite saber de qual cliente a pessoa é. Recomendação: enviar os contatos da empresa dona do número + o link do portal, sem expor contatos de pessoas dos clientes (LGPD).
    4. **Termos:** sem jurídico próprio, então **seguir um padrão**, com um **módulo para a empresa substituir pelos próprios termos** se quiser.
       - Proposta: termos padrão da VLUMA (uso do portal, aviso de privacidade, consentimento de comunicação), versionados e mantidos pelo Super Admin.
       - A empresa pode usar o próprio texto, também versionado.
       - Nova versão pede novo aceite.
       - Recomendação: revisão jurídica do padrão antes da venda.
- ✅ **PONTO 2 FECHADO — confirmado pelo usuário em 2026-10-08.** Resumo:
  1. O portal e o WhatsApp alimentam a **mesma OS**, com **origem** registrada (portal / WhatsApp / e-mail / interno) e o KPI "chamados por canal".
  2. **Etapa 1:**
     - WhatsApp pelo aparelho: botão "Falar pelo WhatsApp" no portal, com o número do chamado; botão na OS com mensagem pronta + link;
     - o gestor registra em nome do solicitante;
     - avisos automáticos por e-mail.
  3. **Com Evolution ou API oficial ligada:** avisos automáticos pelo WhatsApp.
  4. **Etapa 3:** abertura automática pelo WhatsApp, **nativa no ATOS** (Edge Function, mesmas regras do portal). n8n só como integração opcional futura para as empresas.
  5. **Fluxo da conversa:**
     - a empresa é identificada pelo número que recebeu a mensagem; o solicitante, pelo celular confirmado;
     - aceite no primeiro contato;
     - menu: abrir / acompanhar / falar com atendente;
     - abertura guiada (assunto → unidade → descrição com foto e áudio → prioridade → confirmação);
     - mensagens seguintes viram comentário público; fora do horário, avisa o horário.
  6. **"Falar com um atendente"** configurável pela empresa: desativado (não aparece) / atendente humano (pausa o robô) / mensagem com contatos.
  7. **Número desconhecido:** envia os contatos da empresa dona do número + link do portal com **"Solicitar acesso"** (nome, e-mail, cliente → a empresa ou o Supervisor aprova). Nunca expõe contatos de pessoas dos clientes. Sem OS automática.
  8. **Canal dos avisos:** a empresa libera os canais e o usuário escolhe entre os liberados. Canal não liberado: "A <empresa> não disponibiliza este tipo de comunicação no momento".
  9. **LGPD:**
     - aceite registrado (texto, versão, data, canal);
     - retirada a qualquer momento ("SAIR", link no e-mail, preferências no portal);
     - só comunicações de serviço;
     - a empresa é a controladora e a VLUMA a operadora.
  10. **Módulo de termos:**
      - termos padrão VLUMA (uso do portal, privacidade, consentimento de comunicação), versionados pelo Super Admin;
      - a empresa pode substituir pelos próprios, também versionados;
      - nova versão pede novo aceite;
      - recomendada revisão jurídica do padrão antes da venda (não bloqueia o desenvolvimento).
- **Ponto 3 — abertura, prioridade e grupos (N1): proposta levada em 2026-10-08, aguardando.**
  - **3a. Prioridade escolhida pelo solicitante** (decisão do usuário), seguindo o modo da empresa:
    - **modo simples:** escolhe Crítico/Alto/Baixo, com a descrição de cada nível escrita pela empresa;
    - **modo matriz:** responde 2 perguntas simples, e o sistema calcula. Este é o "impacto em linguagem simples" do ponto 5; proposto juntar o ponto 5 ao 3.
    - Configuração "solicitante escolhe a prioridade" (padrão: sim).
  - **3b. Reclassificação pelo N1:**
    - guardar a **prioridade informada** e a **final**;
    - o SLA recalcula a partir da abertura (o gatilho já faz isso);
    - motivo da reclassificação visível ao solicitante;
    - KPI "% reclassificados" por cliente.
  - **3c. Grupos de atendimento** (conceito novo):
    - nome + membros;
    - OS com grupo e técnico;
    - "Minha fila";
    - fila "Novos sem grupo";
    - roteamento automático por categoria (opcional).
    - O papel de quem faz a triagem está em aberto: gestor ou novo perfil "Atendente".
    - SLA de resposta = até a primeira classificação/atribuição ou a primeira resposta pública.
  - **Orientação do usuário (2026-10-08): "siga o ITIL e as melhores práticas do mercado, busque diferencial entre os concorrentes".**
    - **Pesquisa feita:** materiais de ITIL e de ferramentas de ITSM sobre a matriz de prioridade, e os concorrentes BR. Movidesk, Milvus e Tiflux são fortes em help desk/portal e fracos em campo; Auvo e Field Control são fortes em campo, com portal simples e pouco personalizável (Auvo: "Central do Cliente").
    - **Aplicado como padrão de mercado (ITIL):**
      - prioridade = impacto × urgência, com rótulos em linguagem simples, exemplos e ajuda;
      - a escolha do solicitante é **entrada**: o N1 confirma ou ajusta, com motivo registrado;
      - prazo recalculado pela prioridade final;
      - KPI de classificação incorreta;
      - grupos de atendimento com escalonamento funcional (N1 → N2/campo) registrado;
      - KPI de resolução no 1º nível;
      - papel "Atendente" (agente do service desk).
    - **Diferenciais propostos:**
      1. o solicitante vê, já ao abrir, **por que** a prioridade ficou assim e o **prazo previsto** (depende do ponto 8);
      2. **detecção de chamado duplicado** na abertura ("já existe chamado aberto nesta unidade sobre este assunto") com "também me afeta", que pode subir o impacto;
      3. **triagem com contexto de campo** (OS abertas e recentes da unidade, reincidência, horário de funcionamento) e decisão **"resolver remoto × enviar técnico"**;
      4. KPI **"visitas evitadas"** com economia estimada (custo médio de deslocamento configurável);
      5. roteamento automático por **categoria e/ou região da unidade**;
      6. foto/áudio do cliente na abertura para o técnico levar a peça certa (sobe a resolução na 1ª visita).
    - Aguardando decisão do usuário sobre os diferenciais e as etapas.
- ✅ **PONTO 3 FECHADO (e o PONTO 5 — impacto — resolvido junto) — confirmado pelo usuário em 2026-10-08:**
  - padrão ITIL aplicado como descrito acima;
  - os 6 diferenciais aprovados;
  - **Etapa 1:** prioridade em linguagem simples, confirmação/ajuste pelo N1 com motivo visível, KPI de reclassificação, grupos com escalonamento registrado, KPI de resolução no 1º nível, perfil "Atendente", diferenciais 1 (prazo previsto na abertura), 2 (duplicado / "também me afeta"), 5 (roteamento por categoria) e 6 (foto/áudio na abertura);
  - **Etapa 2:** diferenciais 3 (triagem com contexto de campo, remoto × técnico), 4 (visitas evitadas com economia) e roteamento por região.
- **Ponto 4 — tipos no portal: proposta levada em 2026-10-08, aguardando.**
  - Os 4 tipos aparecem como **opções em linguagem do cliente**, com nome e descrição editáveis pela empresa, que também escolhe quais aparecem (padrão: todos, por decisão do usuário):
    - Incidente → "Relatar um problema";
    - Requisição → "Fazer uma solicitação";
    - Visita → "Solicitar visita técnica";
    - Preventiva → "Agendar manutenção preventiva".
  - **Categoria ligada aos tipos** em que aparece (catálogo de serviços, prática ITIL), além de "visível no portal".
  - **Prioridade só no Incidente.** Requisição e Preventiva têm nível fixo; Visita não tem SLA.
  - **Preferência de data/período** (Visita, Preventiva, Requisição), conferida contra o horário de funcionamento e os feriados da unidade (Calendários). O N1 confirma, e o agendamento "a pedido do cliente" vira o prazo, como já existe.
  - **Aprovação do Supervisor do cliente** em requisições de categorias marcadas (cumprimento de requisição no ITIL) — proposta para a Etapa 2.
  - Visita que gera orçamento → backlog.
  - **Resposta do usuário (2026-10-08):** concorda com 4a–4d. Dúvida sobre a frase "catálogo de serviços do ITIL, que o ATOS já tem pela metade" e o impacto dela no portal.
  - **Esclarecimento levado:**
    - **Hoje o catálogo tem:** nome em 2 níveis, impacto/urgência padrão, exceção de SLA por categoria, ativo.
    - **Falta para o portal:** descrição para o cliente, "visível no portal", tipos em que aparece, grupo padrão (diferencial 5), "exige aprovação" (4d), **público** (quais clientes veem) e **formulário próprio do serviço**.
    - **Impacto:** o portal é a vitrine do catálogo, e a qualidade do catálogo define a experiência. A OS interna não muda.
  - **Propostas novas (aguardando):**
    - padrão seguro: categoria **não** visível no portal até a empresa marcar, com um assistente de ativação;
    - **público por cliente** na Etapa 2;
    - **formulário do serviço** reaproveitando o construtor de checklists da F5, na Etapa 2.
  - **Respostas do usuário (2026-10-08):**
    - público por cliente na Etapa 2: OK;
    - formulário do serviço na Etapa 2: OK;
    - sobre "começa invisível", perguntou: "por que já não nasce com o admin escolhendo o que aparece?"
  - **Alinhamento proposto (aguardando):** é o mesmo objetivo.
    - **Categoria nova:** o formulário pergunta "Aparece no portal do cliente?" (Sim/Não), escolha **obrigatória e sem resposta pré-marcada**. O admin decide no momento da criação.
    - **Categorias que já existem** (criadas antes do portal): na ativação do portal, o assistente lista todas para o admin marcar. Até lá, nenhuma aparece.
- ✅ **PONTO 4 FECHADO — confirmado pelo usuário em 2026-10-08** ("caso não fique legal, modificamos durante o desenvolvimento"). Resumo:
  - 4 tipos em cartões na linguagem do cliente; a empresa escolhe quais aparecem (padrão: todos) e edita nome e descrição;
  - categoria indica em quais tipos aparece;
  - prioridade só no Incidente;
  - **preferência de data/período** com checagem do calendário da unidade, em que a confirmação do N1 vira o prazo (Etapa 1);
  - aprovação do Supervisor em categorias marcadas (Etapa 2);
  - **ficha do catálogo** completada: descrição para o cliente, visível no portal, tipos, grupo padrão, exige aprovação;
  - "Aparece no portal?" obrigatório e sem pré-marcação na criação; assistente para as categorias que já existem na ativação;
  - **público por cliente** (Etapa 2);
  - **formulário do serviço** reaproveitando o construtor de checklists da F5 (Etapa 2);
  - orçamento → backlog.
- **Ponto 6 — perfis e equipes: proposta levada em 2026-10-08, aguardando.**
  - **6a. Perfis** (desenho do usuário):
    - **Supervisor:** todos os chamados do cliente, painel completo, gestão de usuários e equipes, aprovações (Etapa 2), abrir chamado em nome de um usuário do cliente. Pode haver mais de um por cliente.
    - **Usuário:** abre chamados; vê os próprios e os das suas equipes; contadores básicos; pode comentar e usar "também me afeta" nos chamados da equipe.
  - **6b. Equipe** = grupo de pessoas do cliente (ex.: "Loja Centro", "Financeiro"), com **unidades opcionais**; uma pessoa pode estar em **várias equipes**.
    - Na abertura, a equipe é automática (se a pessoa tem uma só) ou escolhida.
    - Se a equipe tem unidades, o campo de unidade mostra só as dela.
    - **"Compartilhar com minha equipe"** ligado por padrão; desmarcado, o chamado fica visível só para o solicitante e o Supervisor (prática de mercado para assuntos sensíveis).
  - **6c. Gestão de usuários:**
    - convite por e-mail;
    - nome, e-mail e celular (a confirmação do celular entra na Etapa 3, junto com a abertura pelo WhatsApp);
    - **desativar em vez de excluir** (o histórico é preservado);
    - reenviar convite, mudar perfil e equipes;
    - fila de "Solicitar acesso" (Supervisor; se não houver, a empresa);
    - limites por plano (F8);
    - auditoria de quem criou/desativou.
  - **6d. Lado da empresa:**
    - aba **"Portal"** no cadastro do cliente (liga/desliga, supervisores, usuários, equipes), com o admin/gestor podendo gerenciar em nome do cliente;
    - na OS: solicitante e equipe.
- ✅ **PONTO 6 (lado do cliente) FECHADO — confirmado pelo usuário em 2026-10-08:** 6a–6d como propostos.
  - Falta apontada pelo usuário: **os grupos de atendimento (a equipe técnica, lado interno)**, só esboçados no ponto 3c → detalhados no **ponto 6B**.
- **Ponto 6B — grupos de atendimento (equipe técnica): proposta levada em 2026-10-08, aguardando.**
  - **Nomes distintos:** "Equipes" = lado do cliente; "Grupos de atendimento" = lado interno.
  - **Cadastro do grupo:**
    - nome, descrição, **nível** (N1 / N2 / N3 / Campo);
    - **membros** (técnicos, atendentes, gestores; uma pessoa em vários grupos);
    - **coordenador(es)**;
    - **categorias atendidas** (roteamento automático, Etapa 1);
    - **área de atuação** (UF/cidades, roteamento por região, Etapa 2).
  - **Filas:**
    - "Novos sem grupo" (entrada do N1);
    - **"Fila do grupo"** (OS do grupo sem técnico);
    - "Minhas OS".
  - **Distribuição:**
    - manual pelo coordenador, atendente ou gestor;
    - **"Assumir"** pelo próprio membro **só se o grupo permitir**. Padrão desligado, para preservar a regra atual de que o técnico vê só as próprias OS (decisão do usuário, migrations 042/043). Isso resolve o backlog "técnico pegar OS sem dono";
    - automática por rodízio ou menor carga na Etapa 2.
  - **Escalonamento:**
    - **funcional:** "Escalar para outro grupo" com motivo; histórico e KPI de resolução no 1º nível;
    - **hierárquico:** os alertas de SLA (045) avisam também o coordenador do grupo.
  - **Painel (F7):** filtro por grupo e indicadores por grupo (SLA, fila, idade).
  - **Etapa 2:** horário/plantão do grupo integrado às **escalas** (próximo módulo), com roteamento para quem está de plantão. O horário do grupo **não** altera o SLA do cliente, que segue o horário de atendimento do contrato.
  - **Lembrete do usuário (2026-10-08): os grupos podem transferir o chamado para outro grupo ou para um técnico.** O "Escalar" vira a ação ampla **"Transferir"** (proposta, aguardando):
    - **Destino:** outro grupo (qualquer nível) e/ou um técnico de qualquer grupo. Se o técnico estiver em vários grupos, escolhe-se o grupo. Se o destino for só o grupo, a OS cai na fila dele.
    - **Direção registrada automaticamente** pelo nível: escalonamento (sobe), devolução (desce) ou lateral (mesmo nível).
    - **Motivo obrigatório e curto**, para quem recebe saber o que já foi feito (prática ITIL).
    - **Quem pode:** o técnico responsável pela OS, os coordenadores, os atendentes e os gestores/admin.
    - **O SLA não reinicia:** o prazo é do cliente, de ponta a ponta.
    - **Histórico com o tempo em cada grupo** (base para o KPI "tempo por grupo" futuro).
    - **OS em andamento transferida** volta para "Aberta" na fila ou com o técnico de destino, com registro.
    - **Avisos:** o técnico de destino e o coordenador do grupo de destino são notificados.
    - **KPI "transferências por chamado"** + alerta de **"pingue-pongue"** (mais de 3 transferências) ao coordenador. É um diferencial.
    - **No portal:** mensagem genérica "Seu chamado foi encaminhado a um especialista", sem os nomes internos dos grupos.
- ✅ **PONTO 6B FECHADO — confirmado pelo usuário em 2026-10-08:**
  - cadastro do grupo (nível, membros, coordenador, categorias, área de atuação);
  - filas;
  - distribuição manual + "Assumir" opcional por grupo (padrão desligado; quando ligado, o membro vê só a fila do próprio grupo);
  - **"Transferir"** para grupo e/ou técnico (direção automática, motivo obrigatório, SLA sem reiniciar, tempo por grupo, avisos);
  - quem pode: técnico responsável, coordenadores, atendentes, gestores/admin;
  - alerta de pingue-pongue a partir de 3 transferências (ajustável);
  - alertas de SLA também ao coordenador;
  - mensagem genérica no portal;
  - **Etapa 1:** cadastro, filas, distribuição manual, Assumir, roteamento por categoria, transferência, alertas;
  - **Etapa 2:** região, distribuição automática, plantão.
- **Ponto 7 — "aguardando você", fechamento e satisfação: proposta levada em 2026-10-08, aguardando.**
  - **7a. Aguardando você:**
    - cada **motivo de pausa** ganha **"texto para o cliente"** e a marca **"aguarda o cliente"**;
    - usar um motivo desses exige um **comentário público** com o que se pede;
    - no portal: "Aguardando sua resposta";
    - a resposta do cliente (portal ou WhatsApp) **retoma a OS automaticamente** (relógio do SLA volta) e avisa o técnico/grupo;
    - lembretes automáticos (ex.: 1 e 3 dias úteis) e **encerramento por falta de retorno** após N dias úteis (configurável; fica fora do % de SLA; pode reabrir dentro do prazo).
  - **7b. Fechamento:**
    - "Concluída" na OS = **"Resolvido"** no portal, com resumo + PDF + botões **"Confirmar solução"** / **"Não foi resolvido"**;
    - sem resposta em N dias úteis (padrão 3) → **"Fechado"** automático;
    - **reabertura** só dentro do prazo, com motivo; volta ao último grupo/técnico; o relógio volta a contar (o tempo entre resolvido e reaberto não conta); afeta a 1ª visita e o KPI de reabertura;
    - depois de fechado: **novo chamado vinculado** ("relacionado a #123"), que alimenta a reincidência;
    - sem status interno novo: Concluída + "fechada em" (confirmada ou automática);
    - opção: **assinatura do próprio solicitante em campo** conta como confirmação.
  - **7c. Satisfação (CSAT):**
    - **uma pergunta**, 1–5 estrelas + comentário opcional, na confirmação ou por link de um clique no e-mail/WhatsApp;
    - KPI por técnico, grupo e cliente, no painel F7 e no do Supervisor;
    - **nota 1–2 → alerta ao coordenador/gestor** para retorno ao cliente (diferencial: ciclo fechado).
  - **Etapas propostas:**
    - **Etapa 1:** 7a (sem lembretes) e 7b;
    - **Etapa 2:** CSAT, lembretes, encerramento por falta de retorno, alerta de nota baixa.
  - **Respostas do usuário (2026-10-08):**
    1. Quando o motivo de pausa **depende do cliente**, o cliente deve ser **acionado**; nos demais, apenas **comunicado** → **matriz de motivos de pausa**.
    2. "Resolvido → Fechado" (7b): **OK**.
    3. Assinatura do próprio solicitante em campo conta como confirmação: **OK**.
    4. Satisfação: pesquisa com as **melhores práticas de NPS e satisfação do usuário**, com **painel próprio**.
  - **Proposta levada (aguardando):**
    - **Matriz de motivos de pausa**, configurável por motivo:
      - para o SLA (já existe);
      - **comportamento**: *aciona o cliente* (Aguardando você, comentário público obrigatório, lembretes, retomada automática, encerramento por falta de retorno) / *comunica* (texto ao cliente + **previsão de retorno** opcional; vencida a previsão, alerta ao coordenador) / *interno* (o cliente vê só "Em andamento");
      - texto para o cliente;
      - exige previsão.
      - Padrão dos motivos semeados: "Aguardando o cliente" e "Acesso não liberado" = aciona e para o SLA; "Aguardando peça ou material" = comunica com previsão; "Outro" = interno.
      - Boa prática: parar o SLA só para dependência do cliente ou de terceiro previsto em contrato.
    - **Módulo de Satisfação:**
      - **CSAT transacional** (1 pergunta 1–5 por chamado, logo após resolver; métrica % de notas 4–5);
      - **NPS relacional** (0–10 "recomendaria a <Empresa>?" + "por quê?"; **periódico**, ex.: trimestral, **por pessoa**, nunca por chamado; NPS = % promotores − % detratores);
      - **CES opcional** ("foi fácil resolver?");
      - **anti-fadiga**: quarentena por pessoa, 1 CSAT por chamado, respeito ao aceite LGPD;
      - canais: portal, e-mail de um clique, WhatsApp;
      - **ciclo fechado**: detrator (0–6) ou CSAT 1–2 gera uma **tratativa** com status (aberta / contatado / resolvida) e responsável.
    - **Painel de Satisfação** próprio:
      - NPS e tendência, distribuição promotores/neutros/detratores, taxa de resposta;
      - CSAT por técnico, grupo, cliente e categoria;
      - comentários (detratores primeiro);
      - tratativas;
      - **cruzamento satisfação × SLA cumprido × 1ª visita** (diferencial);
      - NPS segmentado por perfil (Supervisor × Usuário).
      - O Supervisor do cliente vê só o agregado do seu cliente; a nota individual do técnico visível a ele é decisão da empresa.
    - Sugestão: módulo inteiro na **Etapa 2**.
- ✅ **PONTO 7 FECHADO — 2026-10-08.** O usuário delegou os itens 1–3 ao PO ("aplique as melhores práticas de mercado, sempre buscando um diferencial"). Decisões do PO:
  1. **Matriz de motivos de pausa** adotada como proposta (aciona / comunica / interno; padrões dos 4 motivos semeados; aviso ao parar o SLA em motivo interno). Acréscimos:
     - **diferencial**: KPI **"tempo em pausa por motivo"**, que mostra quanto do tempo foi espera do cliente, de terceiro ou interna (argumento em renegociação de contrato);
     - mudança da **previsão** avisa o cliente automaticamente.
  2. **Satisfação:** CSAT por chamado + NPS relacional periódico por pessoa + CES opcional. Acréscimos:
     - **tratativa obrigatória** para detrator ou CSAT 1–2, com **prazo de contato de 2 dias úteis** (boa prática "fechar o ciclo em até 48h") e alerta se vencer;
     - **diferencial "Saúde do cliente"**: índice por cliente que combina NPS, CSAT, SLA cumprido e reincidência, com o alerta **"cliente em risco"** no painel;
     - sem "filtrar avaliações" (pedir avaliação pública só a promotores é proibido pelas regras do Google).
  3. **Público do NPS:** todos os usuários do portal **com chamado nos últimos 90 dias**, segmentado por perfil (Supervisor × Usuário), com quarentena de 90 dias por pessoa.
  4. **Decisão do usuário:** o Módulo de Satisfação vira uma **atividade própria dentro da Etapa 2** (CSAT, NPS, CES, tratativas, Painel de Satisfação, Saúde do cliente).
  - **Etapa 1 do ponto 7:** matriz de pausa ("aciona" sem os lembretes), "Aguardando você" com retomada automática, Resolvido → Fechado com confirmar/reabrir, assinatura do solicitante como confirmação, novo chamado ligado ao anterior.
  - **Etapa 2:** lembretes, encerramento por falta de retorno e a atividade Satisfação.
- **Ponto 8 — SLA visível ao cliente: proposta levada em 2026-10-08, aguardando.**
  - **3 níveis de transparência**, configurados pela empresa com exceção por cliente:
    - **Oculto**: sem prazos;
    - **Previsão** (padrão recomendado): "Previsão de atendimento" e "de solução" em data/hora (não "horas úteis"); Visita mostra só "Agendado para…";
    - **Completo**: + selo no prazo/fora do prazo por chamado e % no prazo no painel do Supervisor.
  - **Diferencial "prazo explicado"**: quando o prazo muda, a linha do tempo diz por quê ("ajustado: aguardávamos sua resposta de 10/10 14h a 11/10 9h"; "reclassificado para Baixo: motivo").
  - **Diferencial "Relatório mensal de SLA"**: PDF automático por e-mail ao Supervisor (chamados, prazos, tempos, satisfação), a prova de contrato que prestadores B2B precisam (Etapa 2).
  - **Refinamento do usuário (2026-10-08):** em vez do relatório mensal simples, **relatório de SLA semanal com tendência** + **fechamento mensal com visão do ano** + **painel próprio** com essas métricas e KPIs, **só para a coordenação (admin)**, que **escolhe quem terá acesso**.
  - **Proposta levada (aguardando):** atividade **"Painel e Relatórios de SLA"** (Etapa 2).
    - **Painel de SLA** (separado do painel gerencial F7):
      - % cumprido por prazo (resposta, atendimento, solução) × meta;
      - tendência das últimas 12 semanas;
      - abertas × resolvidas e backlog;
      - tempos médios;
      - violações por prioridade, categoria, grupo, cliente e técnico;
      - tempo em pausa por motivo;
      - reabertura e 1ª visita;
      - **visão do ano**: mês a mês, acumulado do ano × meta × ano anterior.
    - **Relatório semanal** (PDF + e-mail): semana fechada de segunda a domingo × tendência das últimas 8–12 semanas, enviado na segunda às 8h (fuso da empresa).
    - **Fechamento mensal:** mês fechado + visão do ano, enviado no 1º dia útil.
      - **Números congelados** no fechamento (prova contratual; uma reabertura posterior não altera o mês fechado). Reprocessamento só pelo admin, com auditoria.
    - **Acesso:** o admin escolhe quem vê o painel e quem recebe cada relatório, com **escopo por pessoa**: tudo / grupo(s) / cliente(s).
      - Em aberto: se o admin pode dar acesso também ao **Supervisor de um cliente** (só os dados daquele cliente, respeitando o nível de transparência do ponto 8) ou só a pessoas internas.
- ✅ **PONTO 8 FECHADO — confirmado pelo usuário em 2026-10-08:**
  1. o admin **pode liberar** o painel e os relatórios de SLA também ao **Supervisor de um cliente** (só os dados daquele cliente, respeitando o nível de transparência dele);
  2. semanal na segunda às 8h; mensal no 1º dia útil; **mês congelado** no fechamento (reprocessar só pelo admin, com auditoria);
  3. **3 níveis** do que o cliente vê (Oculto / **Previsão — padrão** / Completo), configurados pela empresa com exceção por cliente;
  4. **"prazo explicado"** na linha do tempo na **Etapa 1**.
  - **Atividade "Painel e Relatórios de SLA"** na Etapa 2 (painel próprio, semanal com tendência, fechamento mensal com visão do ano, acesso escolhido pelo admin com escopo tudo / grupos / clientes).
- **Ponto 9 — telas e KPIs: proposta levada em 2026-10-08, aguardando.**
  - **Portal do cliente:**
    - **login** com a marca da empresa + "Solicitar acesso" + aceite dos termos;
    - **Início**: "Aguardando você" no topo, botão grande "Abrir chamado", contadores (abertos, aguardando você, resolvidos no mês), chamados recentes;
    - **Abrir chamado**: cartões de tipo → assunto → unidade → descrição/foto/áudio → prioridade ou preferência de data → aviso de duplicado → "abrindo para" / "compartilhar com a equipe" → confirmação com número e previsão;
    - **Meus chamados**: abas Abertos / Aguardando você / Resolvidos / Fechados, com filtros e busca;
    - **Chamado**: trilha de etapas (Recebido → Em atendimento → Resolvido → Fechado), previsão, conversa com o prazo explicado, anexos, PDF, confirmar/reabrir, "também me afeta";
    - **Supervisor**: + Painel, Usuários e equipes, Solicitações de acesso, Aprovações (Etapa 2), Relatórios de SLA (se liberados);
    - **Preferências**: canais de aviso e termos aceitos, com retirada do aceite.
  - **KPIs do Supervisor:**
    - abertos e em atendimento agora, aguardando o cliente;
    - abertos × resolvidos no período, com tendência;
    - tempo médio até o atendimento e até a solução;
    - % no prazo (nível Completo);
    - por unidade, equipe e assunto;
    - unidades com reincidência;
    - quem mais abre;
    - satisfação (Etapa 2).
  - **Diferencial: o portal instalável como app (PWA) com o ícone e o nome da empresa** — "o app da Infoxtec" sem loja de aplicativos, com avisos no celular.
  - **Lado da empresa:**
    - **Configurações › Portal**: identidade, endereço/domínio, canais, tipos e textos, transparência, termos, atendente, dias para fechar;
    - aba **Portal** no Cliente;
    - campos novos no Catálogo;
    - página **Grupos de atendimento**;
    - filas na lista de OS;
    - na OS: solicitante, equipe, origem, grupo, prioridade informada × final, comentário público/interno e **Transferir**;
    - perfil **Atendente**;
    - **painel F7 + canal, % reclassificados, resolução no N1, transferências e filtro por grupo**.
  - Mesmos padrões do ATOS: celular primeiro no portal, contraste AA, gráficos pelas regras de visualização já usadas na F7.
  - **Respostas do usuário (2026-10-08):**
    - mapa de telas, KPIs do Supervisor e lado da empresa: **OK**;
    - sobre o "app": perguntou se a ideia era de produto e pediu para **não tirar a opção web**.
  - **Esclarecimento levado:** é um **PWA**, o próprio portal web que pode ser **instalado** na tela inicial. Não há código, loja nem versão separada: **a web continua igual** e a instalação é opcional.
    - Atualiza na hora, junto com o portal.
    - Avisos no celular: Android pelo navegador; iPhone (iOS 16.4+) só quando instalado.
    - **App nativo nas lojas descartado:** um app com a marca de cada empresa exigiria uma publicação por empresa, e a Apple recusa apps "modelo" publicados por terceiros (diretriz 4.3).
    - Dica discreta "Instale o app da <empresa>" a partir da 2ª visita, que pode ser dispensada.
    - Aguardando confirmação: PWA na Etapa 1.
- ✅ **PONTO 9 FECHADO — confirmado pelo usuário em 2026-10-08:** mapa de telas, KPIs do Supervisor e lado da empresa aprovados; **PWA na Etapa 1**, com a web mantida igual.
  - O usuário pediu para **abrir um capítulo sobre app nas lojas** (App Store / Google Play), pensando em comercialização: o cliente escolhe usar pela web ou pelo app → registrado na seção **9.9**.
- **Ponto 10 — segurança e dados: proposta levada em 2026-10-08, aguardando.**
  - **Arquitetura:**
    - **usuários do portal separados dos usuários internos**: ficam numa tabela de vínculos (pessoa, empresa, cliente, perfil, equipes) e **não** na de perfis internos;
    - todas as regras de acesso atuais (que filtram por empresa) negam acesso a eles por padrão;
    - acesso **só por funções próprias do portal**, que devolvem campos seguros: nada de notas internas, custos ou dados pessoais do técnico além do nome;
    - empresa resolvida pelo endereço do portal + vínculos da pessoa;
    - anexos do portal no armazenamento com regra própria.
  - **Comentários:** na OS, **dois botões distintos — "Responder ao cliente" e "Nota interna"** (padrão Zendesk/Freshdesk), em vez de uma chave fácil de esquecer.
  - **Proteções:**
    - limite de tentativas de login e de abertura de chamados (anti-spam);
    - **Cloudflare Turnstile** (verificação anti-robô sem quebra-cabeça) em "Solicitar acesso" e após falhas de login;
    - sessão com expiração;
    - limites de tipo e tamanho de anexo;
    - verificação em duas etapas opcional para o Supervisor (Etapa 2).
  - **Auditoria:** login, abertura, convites, aprovações, aceites e retiradas de aceite.
  - **LGPD — direitos do titular:**
    - ferramenta para o admin da empresa (a controladora) **exportar** os dados de um usuário do portal e **anonimizar** a pedido;
    - desativado mantém os chamados (contrato/legítimo interesse) até um pedido de anonimização.
  - **Testes:**
    - personificação tabela a tabela (como na 043), entre empresas, entre clientes e entre equipes;
    - **roteiro automático de regressão de segurança** rodado a cada mudança de banco.
- ✅ **PONTO 10 FECHADO — 2026-10-08:**
  1. **Dois botões** "Responder ao cliente" / "Nota interna": OK (usuário).
  2. **Turnstile**: o usuário perguntou se os clientes do ATOS precisam ter Cloudflare.
     - **Resposta:** não, só a plataforma ATOS (conta da VLUMA, plano gratuito); o cliente final não percebe nada.
     - Os subdomínios VLUMA são cobertos pelo cadastro de vluma.com.br.
     - Domínio próprio (adicional, Etapa 3): cada domínio é cadastrado na configuração do Turnstile por API; conferir o limite de domínios do plano gratuito na construção.
  3. **Ferramenta de LGPD** (decisão delegada ao Engenheiro/PO) → **Etapa 1**:
     - desde o primeiro dia o ATOS guarda dados pessoais dos funcionários dos clientes;
     - a empresa (controladora) precisa atender pedidos do titular em até 15 dias (LGPD art. 19);
     - desenhar a anonimização desde o início é mais barato do que adaptar depois.
  4. **Verificação em duas etapas** (decisão delegada) → **opcional para o Supervisor na Etapa 2**. Mas o **Supabase já oferece verificação por aplicativo autenticador (TOTP)** a custo baixo, então ela **entra na "Segurança essencial pré-produção" (item 6 da ordem) para Super Admin e admin das empresas**, que têm mais poder que o Supervisor.
- **Ponto 11 — etapas e posição no roadmap:** a posição já foi resolvida na ordem de execução (Portal Etapa 1 = item 1; Etapas 2 e 3 depois da produção).
  - **Escopo consolidado da Etapa 1 e a divisão em 6 entregas foram levados ao usuário para aprovação final antes da construção (2026-10-08, aguardando):**
    - **E1 — Fundação:** banco (vínculos, endereços do portal, configurações), arquitetura de isolamento + roteiro automático de segurança, Configurações › Portal (identidade, nome curto), subdomínio automático (Cloudflare + Vercel), login com a marca, termos (padrão + substituição) e aceite;
    - **E2 — Catálogo e grupos:** ficha do catálogo (descrição, visível no portal obrigatório, tipos, grupo padrão), assistente, grupos de atendimento, perfil Atendente, filas, Assumir opcional, Transferir, pingue-pongue, roteamento por categoria, alertas ao coordenador;
    - **E3 — Clientes no portal:** aba Portal no Cliente, Supervisor/Usuário, equipes, convites, desativar, Solicitar acesso (com Turnstile), vários portais por pessoa, ferramenta de LGPD;
    - **E4 — Abrir e acompanhar:** telas do portal (início, abrir, meus chamados, chamado), cartões de tipo, prioridade em linguagem simples, aviso de duplicado / "também me afeta", preferência de data com calendário, foto/áudio, origem, e-mails automáticos, botões de WhatsApp, canais liberados × escolha do usuário;
    - **E5 — Ciclo do chamado:** Responder ao cliente / Nota interna, confirmação/reclassificação pelo N1 com motivo, matriz de pausa e Aguardando você com retomada, Resolvido → Fechado com reabrir e novo chamado ligado, assinatura como confirmação, níveis de transparência, prazo explicado;
    - **E6 — Painéis e acabamento:** painel do Supervisor, acréscimos no F7 (canal, % reclassificados, resolução no N1, transferências, filtro por grupo), PWA instalável, auditoria e regressão completa.
  - Cada entrega é testada na URL pública antes da próxima.
  - Colocação proposta (a confirmar): KPI "tempo em pausa por motivo" na atividade "Painel e Relatórios de SLA" (Etapa 2).
- ✅ **PONTO 11 FECHADO e REFINAMENTO CONCLUÍDO — aprovado pelo usuário em 2026-10-08 ("vamos em frente"):**
  - escopo da Etapa 1 nas entregas E1–E6;
  - KPI "tempo em pausa por motivo" na Etapa 2;
  - **construção iniciada pela E1 em 2026-10-09**.
  - **2026-10-10 (retorno do usuário):** os **tipos de chamado do portal são escolhidos pela empresa na configuração**, sem depender de categoria habilitada; o assunto só é exigido quando há categorias para o tipo (sem elas o chamado cai na fila de entrada). Menu "Portal do cliente" para a equipe. **Um e-mail existe uma só vez na base** (equipe interna ou portal). Detalhes em PROJETO_ATOS.md.
  - **2026-10-10:** **E4 concluída** (abrir e acompanhar chamado: cartões de tipo, prioridade em linguagem simples ou matriz, aviso de chamado parecido / "também me afeta", datas preferidas com calendário da unidade, fotos e áudio, visibilidade por perfil, avisos por e-mail com consentimento LGPD, botões de WhatsApp, cartão "Aberto pelo portal" na OS), testada na URL pública (71 verificações de banco + telas do cliente e internas, computador e celular). Próxima: **E5 — ciclo do chamado**. Decisões a confirmar em PROJETO_ATOS.md.
  - **2026-10-10:** **E3 concluída** (portal por cliente, convites por e-mail com senha própria, equipes, Supervisor e Usuário, "Solicitar acesso", pedidos de acesso, anonimização/exportação LGPD), testada na URL pública. Pendente para fechar o anti-robô: criar o widget do Turnstile na Cloudflare. Decisões a confirmar em PROJETO_ATOS.md.
  - **2026-10-09:** **E2 concluída** (catálogo e grupos de atendimento, perfil Atendente, filas, assumir, transferir, pingue-pongue, alertas ao coordenador), testada na URL pública; achado e corrigido o acesso de usuários desativados. Decisões a confirmar listadas em PROJETO_ATOS.md.
  - **2026-10-09:** **E1 concluída** e testada na URL pública (35 verificações da E1 + endereço oficial, troca do nome curto e roteiro de segurança com 0 falhas), incluindo o **endereço automático** `atendimento.<empresa>.dev.vluma.com.br` (Cloudflare + Vercel). Detalhes em PROJETO_ATOS.md.
  - Na preparação, achado e corrigido um risco de segurança anterior ao portal (cadastro público com perfil escolhido pelo usuário — PROJETO_ATOS.md, migration 048).

- **E5 — desenho detalhado do ciclo do chamado: PROPOSTA levada em 2026-10-10, AGUARDANDO o usuário** (parte dos pontos 3b, 6, 7, 8 e 10 já aprovados em 2026-10-08; aqui só o desenho de telas e regras para fechar antes de construir). Entrega em 3 partes, cada uma testada na URL pública:
  - **E5a — Conversa e triagem**
    - **Conversa na OS:** dois botões distintos, **"Responder ao cliente"** e **"Nota interna"** (a nota nunca sai da empresa). A resposta aparece na linha do tempo do chamado no portal; o cliente responde (texto + até 3 fotos) enquanto o chamado não estiver Fechado/Cancelado. Resposta do cliente avisa o responsável (sino) e o coordenador do grupo se não houver técnico. Aviso por e-mail ao cliente em "nova mensagem" (respeita o consentimento). A 1ª resposta pública grava o `respondido_em` (SLA de resposta). Comentários antigos continuam internos.
    - **Triagem pelo N1** (Atendente, gestor, coordenador): no cartão "Aberto pelo portal" da OS, **"Confirmar prioridade"** ou **"Reclassificar"** (nova prioridade + **motivo obrigatório**, visível ao cliente); o SLA recalcula a partir da abertura; guarda prioridade informada × final (base do KPI "% reclassificados"). O N1 também pode ajustar a categoria (muda o grupo de roteamento).
  - **E5b — Pausa, "Aguardando você" e prazos**
    - **Matriz de motivos de pausa** (em Catálogo e SLA): cada motivo ganha **comportamento** (*aciona o cliente* / *comunica* / *interno*), **texto para o cliente** e **exige previsão**. Padrões: "Aguardando o cliente" e "Acesso não liberado" = aciona e para o SLA; "Aguardando peça ou material" = comunica, com previsão; "Outro" = interno. Pausar com motivo que *aciona* exige **mensagem pública** (o que se pede).
    - **No portal:** "Aguardando sua resposta" (destaque na lista e no início) / "Em pausa: <texto> · previsão dd/mm" / "Em andamento". A resposta do cliente **retoma a OS sozinha** (o relógio do SLA volta) e avisa o técnico. Mudar a previsão avisa o cliente. Aviso ao parar o SLA em motivo interno (já aprovado).
    - **Transparência do prazo:** por empresa, com exceção por cliente: **Oculto** / **Previsão** (padrão: previsão de atendimento e de solução em data/hora; Visita mostra só "Agendado para…") / **Completo** (+ "no prazo / fora do prazo" por chamado).
    - **"Prazo explicado":** quando o prazo muda, a linha do tempo diz por quê (espera do cliente de dd/mm hh a dd/mm hh; reclassificado: motivo; reaberto), montada a partir dos eventos da OS (pausa, retomada, reclassificação, reabertura).
  - **E5c — Resolvido, Fechado, reabrir e assinatura**
    - **Concluída = "Resolvido" no portal**, com o resumo do que foi feito (`completion_notes`), o PDF do relatório e os botões **"Confirmar solução"** / **"Não foi resolvido"** (motivo obrigatório: a OS **reabre** com o último grupo/técnico; o tempo entre resolvido e reaberto não conta no SLA; entra no KPI de reabertura).
    - **Fechado:** ao confirmar, ou sozinho **após N dias úteis sem resposta** (padrão 3, configurável em Configurações; rotina diária no servidor). Depois de Fechado não reabre: o cliente abre um **novo chamado "relacionado a OS-xxxx"** (base da reincidência). Internamente não há status novo: Concluída + "fechada em dd/mm (confirmada pelo cliente · assinatura em campo · automática)".
    - **Assinatura do solicitante em campo = confirmação:** ver a explicação abaixo.
  - **Assinatura (esclarecimento pedido pelo usuário em 2026-10-10):** a captura no app do técnico **não muda** (toque na tela, nome, motivo de ausência, obrigatoriedade por empresa, PDF). O que muda **só nas OS abertas pelo portal**: na tela de assinatura aparece **"Quem está assinando?"** — "<nome do solicitante> (quem abriu o chamado)" ou "Outra pessoa" (digita o nome). Se for o **solicitante**, a assinatura **conta como a confirmação da solução** e o chamado vai direto a **Fechado** (sem esperar os dias). Se for outra pessoa, ou sem assinatura, o portal pede a confirmação ao solicitante normalmente. OS abertas pela equipe interna: nada muda.
  - **Pontos decididos — usuário respondeu "ok em tudo" em 2026-10-10:** (1) o técnico também "Responde ao cliente" pelo app (só texto); (2) previsão vencida de pausa que "comunica" alerta o coordenador já na E5b; (3) fechamento automático em 3 dias úteis, configurável; (4) transparência padrão "Previsão", com exceção por cliente; (5) o cliente reabre só até o Fechado (depois, novo chamado ligado). *(Texto original da proposta mantido acima como histórico.)*
  - **Perguntas do usuário antes de construir (2026-10-10) e respostas do PO:**
    1. **Motivos de pausa devem poder ser cadastrados.** Já podem (Catálogo e SLA › Motivos de pausa: incluir, ativar/desativar, "para o relógio"). A E5b **mantém** isso e acrescenta, **em todo motivo (inclusive os novos)**, o comportamento (aciona/comunica/interno), o texto para o cliente e "exige previsão".
    2. **Agendamento do chamado.** Já existe: preferência de até 3 datas do cliente na abertura (com aviso do calendário da unidade), "Agendar nesta data" na OS, "a pedido do cliente" (o prazo passa a ser a data), aviso por e-mail e "Agendado para…" no portal. **Lacuna (proposta E5b, aguardando):** *agendamento combinado* — (a) ao agendar, a equipe marca se atendeu uma das datas pedidas; (b) se propôs outra data, o cliente vê "Proposta de data" com **Aceitar** ou **Pedir outra data** (até 3 opções + motivo), que avisa quem agendou; (c) **lembrete por e-mail 1 dia antes da visita** (consentimento LGPD).
    3. **Alerta de SLA e grupos.** O **grupo de atendimento já existe** (E2: nível, membros, coordenadores, categorias, assumir, transferir). Hoje o alerta de SLA em risco/vencido vai a **todos os admins e gestores** da empresa e aos **coordenadores do grupo da OS** (não técnicos); o Supervisor do portal (lado do cliente) **não** recebe alerta. **Proposta (aguardando):** escalonamento por grupo — *em risco* → coordenadores do grupo; *vencido* → coordenadores + **supervisores do grupo** (novo papel por grupo; padrão: admins/gestores se o grupo não tiver); OS sem grupo → admins/gestores. Pergunta ao usuário: quem é o "Supervisor" que citou (um papel interno por grupo ou o Supervisor do portal)?

  - **Retorno do usuário (2026-10-10) — agendamento e alertas, EM REFINAMENTO (nada construído):**
    1. **Agendamento de Incidente/Requisição (reagendar parando o SLA):** o cliente abriu o chamado e, no 1º contato, disse que não pode ser atendido agora; o técnico/atendente deve poder **agendar para outra data e o SLA para**. **Estado real conferido:** (a) existe "Agendar" com a marca "agendado a pedido do cliente"; nesse caso a data agendada vira a **base** do SLA (`sla_base`, migration 044), ou seja, o prazo **recomeça** na data e o tempo já gasto antes some; não é uma pausa; (b) **não existe "Reagendar"** com a OS já Agendada (as ações dali são Iniciar, Concluir e Cancelar; só dá para reagendar passando por Em andamento). **Proposta (aguardando):** botão **Reagendar** em Agendada + agendamento em Aberta/Em andamento/Pausada com **motivo**, e o intervalo até a nova data entra como **pausa do SLA** (motivo fixo "Agendado a pedido do cliente", horas úteis do calendário da unidade), **mantendo o tempo já consumido**; aparece no "prazo explicado" e no KPI "tempo em pausa por motivo". Decisão pendente: pausa (mantém o consumido) ou recomeço (como hoje)?
    2. **Visita:** a Visita **não tem SLA** (só "Agendado para…"). O usuário quer **reagendamento também na Visita, com o cliente podendo reagendar**, e pediu para **refinar o fluxo das visitas** antes de desenhar (perguntas levadas ao usuário: quem define a data e a janela; prazo e limite para o cliente reagendar; cliente ausente; cancelamento pelo cliente; lembrete e "técnico a caminho"; visita que gera outro chamado).
    3. **Alertas de SLA configuráveis por grupo e por pessoa:** o usuário quer poder configurar **grupos e técnicos** como destinatários (flexibilidade). **Proposta (aguardando):** em cada grupo de atendimento, "Avisos de SLA": para **Em risco** e para **Vencido**, escolher destinatários entre os coordenadores (padrão), os membros do grupo, **pessoas específicas** (qualquer usuário interno, inclusive técnico) e **outros grupos**; se ficar vazio, vale o padrão atual (admins/gestores). Fecha a pergunta do "Supervisor" sem criar papel novo.
  - **Respostas do usuário sobre a Visita e o agendamento (2026-10-10) e DESENHO PROPOSTO — aguardando aprovação:**
    - *Pesquisa de mercado feita* (fontes no PROJETO_ATOS.md, seção do retorno): **não há regra do ITIL** sobre o assunto; o que ITIL/ITSM e as ferramentas praticam é **pausar o relógio só por espera documentada** (cliente indisponível, aguardando o cliente), com **motivo e data/hora de início e retomada registrados**, **visível nos relatórios** (para não inflar o cumprimento) e, para pausa a pedido do cliente, **data de retorno ou duração máxima, com retomada automática**. ServiceNow (condição de pausa por motivo "aguardando o solicitante"), Zendesk (pausa em Pendente) e Freshservice (liga/desliga o relógio por status) seguem essa linha. Em campo (field service): **cliente sugere / equipe confirma** é o modelo híbrido comum, com agendamento por **horários disponíveis**, **janelas de chegada estreitas**, **confirmação logo após marcar + lembretes (ex.: 1 semana, 1 dia e 2 h antes, ou 48 h e manhã do dia) com Confirmar / Reagendar / Cancelar em 1 clique**, reagendamento fácil (evita cancelamento), política de cancelamento à vista e **medição de ausências**.
    - **Reagendar Incidente/Requisição → pausar o SLA mantendo o tempo já gasto** (recomendação confirmada pela pesquisa), com motivo fixo, data de retorno = nova data, retomada automática, **limite de pausas por chamado configurável** e visível no "prazo explicado" e no KPI "tempo em pausa por motivo".
    - **Calendário de agendamento (decisão do usuário: configurável pelo admin):** o cliente escolhe datas/horários a partir da abertura respeitando uma **antecedência mínima** (ex.: **48 h** após abrir), um **horizonte máximo**, os **dias e horários de atendimento** (calendário da unidade, feriados) e **janelas** definidas pela empresa (padrão Manhã/Tarde; a empresa pode estreitar, ex.: 2 h). Até 3 opções, como hoje. A equipe **confirma** uma delas (ou propõe outra com motivo) → Agendada + e-mail de confirmação.
    - **Reagendar pelo cliente e cancelar pelo cliente (decisão: sim; limites configuráveis pelo admin):** antecedência mínima para reagendar/cancelar, nº máximo de reagendamentos, motivo obrigatório ou não. Reagendar escolhe novas opções no mesmo calendário e avisa quem agendou; a equipe também tem **Reagendar**.
    - **Lembretes (decisão: configuráveis, escolhendo quais dias):** o admin define **até 3 disparos** (N dias/horas antes da visita) e o canal (e-mail; WhatsApp quando houver conexão); cada lembrete traz **Confirmar / Reagendar / Cancelar**. "Técnico a caminho": não pedido, fica como opção futura.
    - **Cliente ausente (decisão: registrar e cancelar com status):** o técnico marca **"Cliente ausente"** no app (hora, foto e posição como prova) → OS **Cancelada** com motivo codificado, o cliente é avisado e vê **"Pedir nova visita"** (novo chamado ligado). Recomendado: **motivos de cancelamento cadastráveis** (como os de pausa): Cliente ausente, Cancelado pelo cliente, Sem acesso ao local, Duplicado, Outro; KPI **"visitas improdutivas"**. Sem status novo na OS.
    - **Visita gera chamado (decisão: sim):** da Visita concluída a equipe cria um **Incidente ou uma Requisição** ligados ("relacionado a OS-xxxx", herdando cliente, unidade e anexos); **ambos podem gerar um Orçamento**.
    - **ORÇAMENTO → BACKLOG (decisão do usuário em 2026-10-10): "vamos colocar orçamento no backlog, mas ele vai entrar como uma opção das OS".** Fica fora da sequência até o PRD; quando entrar, será uma opção dentro da OS. Registro original do radar:
    - **ORÇAMENTO — radar levantado (2026-10-10), fora do escopo E1–E6:** o usuário quer **integrar ou reutilizar o sistema de orçamento que já existe**. Perguntas levadas: qual é o sistema (nome, onde roda, tecnologia, tem API, é multi-empresa); integrar (o ATOS chama o sistema e traz número, valor, status e PDF) ou reaproveitar o código dentro do ATOS (ou orçamento simples nativo); quem aprova no portal; se aprovado vira OS de execução; se faturamento fica de fora. **Preparação sem retrabalho na E5:** o vínculo "relacionada a" e a origem "visita" já nascem na E5c.
  - **Aprovado pelo usuário em 2026-10-10 ("ok para todas"):** (1) reagendar Incidente/Requisição **pausa o SLA mantendo o tempo já gasto**, com retomada automática na nova data e limite de pausas por chamado; (2) o **fluxo da visita** acima (calendário configurável, reagendar e cancelar pelo cliente, lembretes, cliente ausente, visita gera chamado); (3) **ordem da E5:** E5a (conversa e triagem) → E5b (pausa, prazos, agendamento e visita) → E5c (fechamento). **Construção da E5a iniciada em 2026-10-10 e CONCLUÍDA no mesmo dia** (conversa Responder ao cliente / Nota interna, mensagens do cliente com fotos, triagem do N1 com motivo visível; migration 066). Falta E5b e E5c.
- ✅ **ESTRUTURA OFICIAL DE ENDEREÇOS — definida pelo usuário em 2026-10-09 (portal: pontos 1 e HML confirmados):**

| Quem | PRD | HML (DEV) |
|---|---|---|
| **Super Admin** (administração de todos os recursos VLUMA) | `atos.vluma.com.br` | `atosdev.vluma.com.br` |
| **Clientes VLUMA/ATOS** (administração, supervisão, técnicos) | `atos.vluma.com.br` ou domínio próprio | `atosdev.vluma.com.br` |
| **Clientes dos clientes** (portal de abertura de chamado) | `atendimento.<empresa>.vluma.com.br` ou domínio próprio de atendimento | `atendimento.<empresa>.dev.vluma.com.br` |

  - O Super Admin e as empresas usam o **mesmo endereço**: o login define o que cada um vê.
  - **HML do portal:** `atendimento.<empresa>.dev.vluma.com.br`, o mesmo padrão da produção com `.dev` (confirmado pelo usuário). O endereço único `atendimento.dev.vluma.com.br` ficou descartado, porque o portal identifica a empresa pelo endereço.
  - **Ponto em aberto, sem decisão:** **domínio próprio para a gestão e os técnicos** (`atos.<empresa>.com.br`). Não foi refinado; tende a ser adicional pago na F8, junto do domínio próprio do portal. Hoje um domínio desconhecido cai no ATOS, mas falta o cadastro, a configuração na Vercel e o endereço correto nos e-mails.
  - **Estado de 2026-10-09:**
    - o código reconhece `atosdev.vluma.com.br` e `atos.vluma.com.br` como ATOS e `atendimento.*` como portal;
    - os endereços do portal ainda **não existem** (domínio base da plataforma vazio, sem DNS na Cloudflare, sem cadastro na Vercel);
    - para criá-los, faltam o token da Cloudflare (+ Zone ID) e o token da Vercel;
    - no DEV, o domínio base será `dev.vluma.com.br`.
  - **Regra de teste:** URL pública = `https://atosdev.vluma.com.br`.

### 9.2. Garantir estrutura de tenant pronta para SaaS
Fundação multi-tenant já existe (F1: RLS, isolamento). Falta **auditar** o que está pronto vs o que falta para operar como SaaS comercial (limites por plano, contadores de uso, bloqueio suave, Super Admin comercial).

### 9.3. Migração DEV → PRD (repositórios distintos)
Arquitetura já definida: `atosdev` / `atosprd` (repos separados). **Falta o processo documentado de promoção** — como levar código do DEV ao PRD com segurança.
> Reaproveitar o padrão **blue-green** já validado no Orçamento Infoxtec (repos duplos, Supabase separados, Vercel, DNS).

### 9.4. Migração de banco DEV → PRD
Dois projetos Supabase separados (já existem). **Falta:** processo de aplicar as migrations (001–010+) no PRD ao replicar, garantindo paridade de schema.

### 9.5. Keep-alive Supabase (CRÍTICO)
Banco **free suspende por inatividade** — risco de o sistema cair.
- Aplicar o padrão VLUMA já documentado (`VLUMA_KeepAlive_Supabase_Padrao_v2.1`)
- Tabela **`keepalive_ping`** obrigatória em **todos os ambientes** (DEV e PRD), com coluna `ambiente` (PRD/HML) para visibilidade no log
- **GitHub Actions** com ping periódico
> **Avaliação:** isto é infraestrutura de sobrevivência, não "feature pós-MVP".

### 9.6. Portal self-service para novos clientes
Empresa se cadastra sozinha, escolhe plano, entra em trial. Depende da camada comercial (F8). Ligado ao item 8.1 (auto-cadastro + landing page).

### 9.7. Módulo de Relatórios / Auditoria de Checklists
Tela para consultar o **histórico de alterações das respostas de checklist** (rastreabilidade).

**Contexto — regra de negócio definida (F5):**
- O técnico preenche o checklist de forma **parcial** e salva (itens em branco permitidos); pode voltar e continuar depois.
- Ao retornar, o sistema **não trava** edições anteriores — o técnico pode corrigir respostas já salvas.
- **Toda alteração de uma resposta já salva gera um registro do estado anterior** (versionamento), preservando a trilha completa para rastreabilidade.
- Após **Concluir**, o checklist fica travado para o técnico; **somente o Admin pode reabrir** (e toda reabertura/edição também fica registrada).

**Implementação da captura (feita na F5, agora):** tabela de histórico (`checklist_answer_history`) + **trigger no banco** que grava automaticamente a versão anterior a cada alteração — garante que nenhuma mudança escape, independentemente da origem (técnico, admin, futuro app).

**Pendente (este item de backlog):** a **tela de consulta/visualização** desse histórico — navegável, filtrável, para o gestor auditar quem alterou o quê e quando. Encaixa perto da **F7 (painel gerencial)** ou como módulo de auditoria dedicado. Consome os dados que já estarão sendo capturados desde a F5.

---

### 9.8. Módulo "Calendário e Jornada" — base para recorrência, SLA, escala e ponto (proposta 2026-09-25, aguardando decisão)
Pedido do usuário: registrar feriados nacionais, escala de trabalho dos funcionários e horário de atendimento da equipe, para depois incorporar **registro de ponto, envio de escala e controle de SLA**.

**Ideia central:** uma única base de "tempo de trabalho" que todos os módulos consultam — nunca cada módulo com sua regra de dia útil.
- **Etapa 1 — Calendário da empresa** (pequena; antes da recorrência): feriados (nacionais mantidos pela plataforma; estaduais/municipais aplicados pela UF/cidade da **unidade**; próprios da empresa; tipo "feriado" ou "ponto facultativo" — ex.: Carnaval não é feriado nacional, a empresa decide) + horário de atendimento da empresa por dia da semana. "Dia útil" passa a ser definido por aqui
- **Etapa 2 — Escalas** (modelos 5x2, 6x1, 12x36, turnos, plantão/sobreaviso; atribuição por técnico com vigência) + **envio/publicação da escala** ao técnico com ciência registrada
- **Etapa 3 — SLA** (já no backlog): prazo em horas úteis = expediente − feriados da unidade, pausa fora do horário
- **Etapa 4 — Ponto**: produto regulado (Portaria MTP 671/2021 — REP-P, arquivos AFD/AEJ, comprovante, registro do programa no INPI) + LGPD (GPS/foto na marcação muda o princípio "GPS só na evidência"). Decidir **construir x integrar** (Pontomais/Tangerino/Sólides etc.) antes, com contador/advogado trabalhista
- Etapas 2–4 ficam **fora do MVP** (proposta); Etapa 1 entra agora por ser pré-requisito da recorrência
- **Decisões do usuário (2026-09-25):**
  - Etapa 1 (Calendário da empresa) **aprovada**, entra antes da recorrência
  - Etapas 2–3 fora do MVP, fases novas depois da F7 — **aprovado**
  - **Registro de ponto REMOVIDO do escopo** (inclusive a "jornada operacional") — descartado pela complexidade formal (Portaria 671/REP-P, LGPD). A Etapa 4 deixa de existir
  - **No lugar do ponto: notificação diária ao funcionário** informando onde iniciar a escala do dia, com as OS e checklists em nome dele. A refinar com o usuário — ele tem um **desenvolvimento existente que pode ser aproveitado**
  - Horário de atendimento (um para a empresa inteira x por equipe/região): **a refinar**
- **Pedido do usuário (2026-09-25):** definir AGORA todo o domínio de horário com visão de produto (destrava recorrência, deixa pronto SLA e envio de mensagens) + sugestão de nome. **Proposta levada, aguardando decisão:**
  - **Nome do módulo: "Calendários"** (padrão do GLPI/ITSM, conhecido do público; evita "Jornada", termo trabalhista ligado ao ponto descartado). Reservar "Agenda" para uma futura visão de OS em calendário
  - **Seis conceitos, cada um com um dono:** (1) fuso horário da empresa; (2) feriados em camadas (plataforma/UF/município/empresa + ponto facultativo) + dias especiais (ex.: 24/12 até 12h); (3) **horários de atendimento NOMEADOS e reutilizáveis** ("Comercial", "24x7", "Estendido"), um marcado como padrão da empresa — resolve "por empresa x por equipe": cliente/contrato/equipe escolhe um; (4) escalas da equipe (modelos semanais e cíclicos 12x36/6x1, atribuição com vigência, exceções folga/férias/atestado/troca, local de início do dia); (5) horário de funcionamento da Unidade do cliente (opcional, alerta ao agendar); (6) funções de tempo no banco (é dia útil? próximo momento útil? horas úteis entre A e B?) usadas por recorrência, SLA e mensagens
  - **Distinção central:** horário de ATENDIMENTO (quando a empresa atende o cliente → SLA) ≠ ESCALA (quando a pessoa trabalha → notificação diária, atribuição)
  - **Achado técnico:** Unidade guarda cidade/UF como texto livre — feriado municipal exige código IBGE da cidade (preenchido pelo CEP/lista, BrasilAPI)
  - **Alerta trabalhista (PO):** mensagem ao funcionário fora do horário de trabalho pode caracterizar sobreaviso (Súmula 428 TST) → notificação diária deve respeitar a escala (ex.: no início do turno ou X min antes), nunca à noite por padrão
  - **Entrega proposta:** desenhar tudo agora; construir já fuso + feriados + horários de atendimento + funções (destrava recorrência e prepara SLA); escalas junto com a notificação diária (após refinamento)
  - **APROVADO pelo usuário (2026-09-25):** nome "Calendários"; distinção atendimento x escala com horários de atendimento nomeados + padrão; horário de funcionamento da Unidade **entra agora**; código IBGE na Unidade (existentes ajustadas automaticamente); ordem de construção (1. base de tempo → 2. recorrência → 3. F7 → 4. escalas + notificação diária → 5. SLA)
  - **Etapa 1 CONCLUÍDA em 2026-09-25** (migration 035, testada na URL pública — ver PROJETO_ATOS.md): fuso, feriados em camadas, horários de atendimento nomeados, horário da Unidade com cidade IBGE e funções de tempo. **Próximo: recorrência dos checklists** (desenho já aprovado, seção F5)
  - **Endereço de Clientes/Unidades — APROVADO e ENTREGUE em 2026-09-25** (migration 036; antes: "proposta, aguardando decisão"). Em aberto resolvidos: CPF para pessoa física = sim ("CPF ou CNPJ"); obrigatórios = UF + cidade. Pré-requisito da recorrência, a pedido do usuário:
    - **Glossário fixo:** Super Admin → **Empresas** (tenants = clientes da plataforma VLUMA); dentro da empresa → **Clientes** (quem a empresa atende) e **Unidades** (endereços físicos do cliente; a principal nasce com o cliente). Nunca "cliente" para tenant na interface
    - **Endereço estruturado** num componente único (Cliente e Unidade): CEP (preenche rua, bairro, cidade/UF com código IBGE) + número + complemento; cidade sempre da lista do IBGE
    - **Endereço mora só na Unidade** (fonte única): o bloco de endereço do modal do Cliente edita a Unidade principal, na criação e na edição
    - **CNPJ do cliente → "Consultar na Receita"** preenche nome, telefone e endereço completo (reuso de `src/lib/cnpj.ts`)
    - **Sede da empresa pela Receita** na Identidade legal do Super Admin
    - Em aberto: CPF para cliente pessoa física; quais campos do endereço são obrigatórios
  - **Notificação diária fora da escala (decisão do usuário):** por padrão respeita a escala, **mas o gestor pode enviar fora do horário**, com aviso claro de que o funcionário está fora da escala (registrar quem enviou e quando)

### 9.9. App nas lojas (App Store / Google Play) — capítulo aberto pelo usuário em 2026-10-08, em discussão
Pedido do usuário: ter app nas lojas para **ampliar a comercialização**; o cliente escolhe usar pela **web ou pelo app**. Parecer levado (Engenheiro/PO/UX):
- **PO — vale a pena:**
  - "tem app?" é pergunta de compra de PME;
  - a presença na loja dá credibilidade e prova social (avaliações; o risco de avaliação ruim também é real);
  - concorrentes de campo (Auvo, Field Control) têm app nas lojas.
  - **O maior valor comercial está no app do TÉCNICO**: modo **offline** (subsolo, área rural), avisos confiáveis, câmera e GPS nativos. O solicitante ganha avisos confiáveis no iPhone.
- **Modelos:**
  - (A) **um app "ATOS" publicado pela VLUMA**: multiempresa; depois do login, assume a marca da empresa; atende técnico e solicitante (o login define a experiência). Permitido pela Apple: um app, um publicador;
  - (B) **app com a marca da empresa** (adicional premium, F8): a Apple só aceita se publicado na **conta de desenvolvedor da própria empresa** (diretriz 4.2.6), com a VLUMA gerando e enviando por ela.
- **Engenheiro:**
  - **Capacitor** sobre o app React atual: reaproveita praticamente todo o código e acrescenta recursos nativos (push FCM/APNs, câmera, GPS, armazenamento offline, biometria);
  - sem reescrever em React Native;
  - a Apple recusa "site empacotado" sem valor nativo (diretriz 4.2) → push, offline e biometria resolvem;
  - atualizações de tela sem passar pela loja são permitidas enquanto não mudam o propósito do app (3.3.2);
  - links do e-mail/WhatsApp abrem no app quando instalado (universal links / app links, configurados por domínio);
  - contas: Apple Developer (US$ 99/ano, organização com D-U-N-S da VLUMA) e Google Play Console (US$ 25 uma vez).
- **UX:** mesma conta e mesmos dados na web, no PWA e no app; o usuário escolhe; o app soma offline e avisos nativos.
- **Sugestão de posicionamento no roadmap:** fase própria **depois** da Etapa 1 do portal e da promoção para PRD.
  1. App "ATOS" (modelo A) com técnico + solicitante;
  2. **offline do técnico** (diferencial de campo);
  3. app com a marca da empresa (modelo B) como premium.
- **2026-10-08 — decisão do usuário:** por ora, **apenas criar a fase** (F12 no roadmap); os detalhes ficam para depois.
- **Perguntas em aberto (para quando a F12 for detalhada):**
  - fase própria no roadmap?
  - um app para todos os perfis ou dois (Campo × Atendimento)?
  - modelo B como premium na F8?
  - contas das lojas no CNPJ da VLUMA?

## 10. ECOSSISTEMA VLUMA — PRODUTO IRMÃO: CLAREZZA

O ATOS não é um produto isolado. Ele integra um **ecossistema** com o **Clarezza**.

### O que é o Clarezza
Plataforma de **inteligência de negócio (BI) acessível para PMEs brasileiras**. O dono da empresa faz **upload de planilha/PDF** — **ou conecta o ATOS** — e em segundos tem dashboards, KPIs e **insights em linguagem natural gerados por IA (Claude API)**, sem precisar saber Power BI nem contratar consultor.

### Estratégia de cross-sell
O ATOS traz **insights básicos nativos** no dashboard — suficientes para **despertar o interesse** pelo Clarezza:

| Insight | No ATOS | No Clarezza |
|---------|---------|-------------|
| Demandas com SLA vencido | ⚠️ Alerta simples | 📊 Análise detalhada + causa |
| Loja/setor com mais chamados | 📈 Gráfico de barras | 🤖 Recomendação IA + previsão |
| Orçamentos pendentes | 💰 KPI total | 🕐 Previsão de aprovação + risco |
| Técnico sobrecarregado | 👤 Ranking simples | 🚨 Alerta de risco operacional |
| Evolução mensal | 📉 Gráfico de linha | 📈 Tendência + anomalias IA |

### Roadmap Clarezza v1.0 (após o ATOS)
C1 Setup · C2 Upload (planilha/PDF) · C3 Dashboard automático · C4 IA (Claude API) · C5 API VLUMA (integração com o ATOS) · C6 Linguagem natural

> **Prioridade estratégica:** terminar o **ATOS v1.0 primeiro** — já tem cliente real (Infoxtec/Atakarejo) e gera receita imediata. O Clarezza vem depois, reaproveitando toda a infraestrutura construída.

---

## 11. MÓDULOS DA VISÃO ORIGINAL (Operax) — POSICIONAR NO ROADMAP

Módulos concebidos no Operax que **não estão no roteiro atual do ATOS**. Registrados para decisão futura:

- **Demandas / Service Desk** — SLA, categorias, prioridades, aprovação de orçamento
- **Projetos** — Kanban + Lista + Gantt
- **Financeiro** — controle de valores por demanda e projeto
- **Perfis por projeto** — Owner / Manager / Operador / Visualizador
- **Login social** — Google e Microsoft (hoje: e-mail + senha)

> **Decisão pendente:** avaliar quais destes entram no ATOS pós-MVP e quais foram descartados no refinamento para foco em campo.

---

## 12. PRINCÍPIOS DE DESENVOLVIMENTO

- Desenvolvimento em **DEV primeiro**; replicação para PRD **somente após validação**
- **Conclusão integral** de cada fase antes de avançar
- Validação a cada etapa pela **URL pública (Vercel)**, com avanço mediante confirmação
- **Responsividade desde o início** — o portal do técnico é mobile-first
- Consistência de **identidade VLUMA** em todos os produtos
- **Verificação do conteúdo dos arquivos** antes de confirmar implementações
- **Um passo por vez** — aguardar confirmação antes de seguir

---

*Documento mestre da visão. Atualizar a cada decisão estratégica.*
*Complementa o PROJETO_ATOS.md (estado técnico do código).*
