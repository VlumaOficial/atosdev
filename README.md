# ATOS — Gestão de Campo

**Desenvolvido por VLUMA Tecnologia**

Sistema de gestão de ordens de serviço para equipes técnicas de campo. Produto SaaS multi-tenant com branding Infoxtec como primeiro tenant validador.

---

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v3 + Shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Deploy**: Vercel (frontend) + Supabase Cloud (backend)
- **Autenticação**: Supabase Auth

## Ambientes

| Ambiente | GitHub | Supabase |
|---|---|---|
| DEV | `VlumaOficial/atosdev` | `vgkiddqahubznlzkxfgb` |
| PRD | `VlumaOficial/atosprd` | `zeejmwdyqrbjnkhwtdsu` |

## Setup local

```bash
# 1. Clone o repositório
git clone https://github.com/VlumaOficial/atosdev.git
cd atosdev

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com as credenciais DEV

# 4. Execute a migration no Supabase DEV
# Acesse: https://supabase.com/dashboard/project/vgkiddqahubznlzkxfgb/sql
# Cole e execute o conteúdo de: supabase/migrations/001_f1_multitenant.sql

# 5. Inicie o servidor de desenvolvimento
npm run dev
```

> ⚠️ **NUNCA** rodar `npm run dev` via Cascade. Sempre testar pela URL pública do Vercel.

## Perfis de acesso

| Role | Descrição |
|---|---|
| `super_admin` | VLUMA — acesso total a todos os tenants |
| `admin` | Administrador da empresa cliente |
| `gestor` | Gestor de equipe, cria e distribui OS |
| `tecnico` | Técnico de campo, executa OS |

## Roadmap

| Fase | Descrição | Status |
|---|---|---|
| F1 | Fundação, multi-tenant, autenticação, perfis | ✅ |
| F2 | Clientes e locais | ⏳ |
| F3 | Ordens de Serviço (gestor) | ⏳ |
| F4 | App de campo (técnico) — mobile-first | ⏳ |
| F5 | Checklists dinâmicos por tipo de serviço | ⏳ |
| F6 | Assinatura digital + geração de PDF + WhatsApp | ⏳ |
| F7 | Painel gerencial e indicadores | ⏳ |
| F8 | Financeiro + SaaS (Asaas) | ⏳ |
| F9 | Integração GLPI | ⏳ |
| F10 | OWASP + segurança | ⏳ |
| F11 | Manual + documentação | ⏳ |

## Padrão de desenvolvimento

- Um step por vez — aguardar confirmação antes de avançar
- Nunca rodar `npm run dev` via Cascade
- Todo teste pela URL pública do Vercel (DEV)
- Commits via WSL terminal: `git add . && git commit -m "..." && git push`

---

*ATOS — Gestão de Campo · Desenvolvido por VLUMA Tecnologia · vluma.com.br*
