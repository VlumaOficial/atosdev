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
| **F7** | Painel gerencial e indicadores | Sim | ⏳ Pendente |
| **F8** | Planos, Asaas, cobrança, trial | Não | 📋 Backlog |
| **F9** | Integração GLPI | Não | 📋 Backlog |
| **F10** | OWASP e segurança | Não | 📋 Pós-MVP |
| **F11** | Manual e documentação | Não | 📋 Pós-MVP |

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

**Painel do Gestor — Disparo Manual**
- Gestor dispara WhatsApp informando o número na hora
- Gestor envia e-mail (destinatário, assunto, texto) **anexando uma ou várias OS**

**Controle de Envio pelo Admin**
- **Bloqueio global:** Admin desliga o envio para todo o tenant
- **Bloqueio por técnico:** Admin define quais técnicos podem enviar OS

### F7 — Painel Gerencial ⏳
Indicadores da operação: OS abertas / em andamento / concluídas, **produtividade por técnico**, **tempo médio de atendimento**, OS por cliente.

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
