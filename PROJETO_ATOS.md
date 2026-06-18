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

- **Super Admin VLUMA:** adm@vluma.com.br | role super_admin | tenant_id null
- **Admin Infoxtec:** adm@infoxtec.com.br | role admin | tenant Infoxtec
- **Tenant Infoxtec:** "Infoxtec Tecnologia e Serviços Ltda." | CNPJ 04.309.223/0001-96
- **Massa de teste:** "Cliente Trigger Teste" (cliente), "Usuário Testes" / teste2 (técnicos)

---

## 3. Estado das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| F1 | Multi-tenant, auth, RLS, marca, reset de senha | Completa |
| Design System | Button, Input, Card, Modal, Combobox, EmptyState, PageHeader, DataListView | Completo |
| F2 | Clientes e Unidades | Completa |
| F3 | Ordens de Serviço | Em andamento |
| — Técnicos | Cadastro via Edge Function | Completo |
| — OS | CRUD, status, comboboxes encadeados | Iniciando |
| F4 | App de campo do técnico (mobile) | Pendente |
| F5 | Checklists | Pendente |
| F6 | Assinatura + evidências + envio | Pendente |

---

## 4. Padrões do Projeto (NÃO violar)

### Listagem (DataListView)
Toda entidade gerenciável usa o DataListView: tabela/cards com toggle, busca, chips de filtro, linha viva, paginação 10/25/50/100.

### Ações de listagem
Padrão para Técnicos, Checklists, OS e futuras:
1. Editar (lápis)
2. Ativar/Desativar (power) — preserva histórico
3. Excluir (lixeira) — exceção
+ toggle de status no formulário de edição + coluna Status + chips Todos/Ativos/Inativos

### Dropdowns
Sempre Combobox com busca (Command + Popover Shadcn) — nunca select simples — quando houver itens dinâmicos.

### Preferência de visão
Persistida no banco (users.preferences.views[key]). Padrão table.

### Status vs Toggle
Entidades de cadastro (cliente, unidade, técnico) = ativo/inativo (toggle).
OS = máquina de estados (fluxo), não toggle.

---

## 5. Modelo Cliente / Unidade (F2)

1. Endereço obrigatório no cadastro de cliente (validação no front)
2. Endereço gera automaticamente a unidade principal (trigger), nomeada com o nome do cliente
3. Unidade principal pode ser editada, não excluída se for a única
4. Nomenclatura visível: "Unidade/Unidades" (rota /locais e tabela locations mantidas por dentro)
5. Filtro por cliente na tela de Unidades (Combobox com busca)

---

## 6. Ordem de Serviço (F3) — Decisões MVP

- Status fixos: Aberta (sem técnico = backlog) → Agendada (data + motivo) → Em andamento → Pausada (motivo obrigatório) → Concluída / Cancelada (motivo)
- Técnico opcional na criação (OS "Aberta" aguardando atribuição)
- Prioridades fixas: Normal, Alta, Urgente
- Comboboxes encadeados: Cliente → filtra Unidades → Técnico
- Número sequencial por tenant: OS-0001, OS-0002...
- RLS: admin/gestor gerenciam todas do tenant; técnico só vê/edita as próprias

### Técnicos
- Técnico é usuário que loga (role tecnico), terá app de campo na F4
- Criação via Edge Function criar-tecnico (admin define senha provisória; técnico troca via reset)
- Telas separadas: "Técnicos" (campo) e "Usuários" (escritório)

---

## 7. Migrations Aplicadas (DEV)

| Arquivo | Conteúdo | DEV | PRD |
|---------|----------|-----|-----|
| 001_f1_multitenant | tenants, users, triggers, RLS inicial | OK | Pendente |
| 002_fix_rls_recursion | funções get_meu_role/get_meu_tenant (SECURITY DEFINER) | OK | Pendente |
| 003_f2_clients_locations | tabelas clients, locations + RLS | OK | Pendente |
| 004_f2_unidade_principal | is_primary + trigger unidade principal | OK | Pendente |
| 005_f3_orders | orders, order_sequences, número sequencial, RLS | Em andamento | Pendente |

---

## 8. BACKLOG (pós-MVP ou quando priorizado)

- [ ] Modal/página de cliente com gestão de unidades embutida (abas Dados/Unidades, salvar em transação na criação). Hoje resolvido via trigger + tela separada.
- [ ] Criação de técnicos via convite por e-mail (inviteUserByEmail) — mais profissional que senha provisória.
- [ ] Módulo de SLA (prazos por prioridade, alertas de estouro) + status e prioridades configuráveis por tenant. Após validação em campo.
- [ ] Aplicar todas as migrations no PRD ao replicar; verificar/limpar tabelas do projeto PRD que recebeu F1 por engano.
- [ ] Campo "nome fantasia/exibição" no tenant (nome longo cortado na sidebar).
- [ ] Ajuste de contraste do ícone ATOS na sidebar (fundo escuro do ícone some no fundo escuro).
- [ ] Modelo de vendas (planos/Asaas/trial/add-ons/anti-fraude) — fora do MVP.

---

## 9. Notas Técnicas

- Edição de arquivos grandes: heredoc com delimitador 'ATOSEOF' (aspas simples — bash não interpreta). Funciona desde que o conteúdo não tenha a tag a-link literal. Validar sempre o balanceamento de chaves/parênteses após criar.
- usePaginatedQuery: dependências congeladas com useRef; fetchData depende só de [page, pageSize, search, eqColumn, eqValue] para evitar loop infinito de render.
- Edge Functions: deploy via supabase functions deploy <nome>. SERVICE_ROLE_KEY injetada automaticamente. Erros HTTP do invoke vêm encapsulados — ler error.context para a mensagem real.
- Sessão: Supabase persiste por padrão (renova token). Usuário fica logado até deslogar manualmente.

---

*Última atualização: durante F3 (Ordens de Serviço — Técnicos completos, OS iniciando).*
