# Testes de tela (Playwright) — ATOS

Rodam contra a URL pública de DEV (**https://atosdev.vluma.com.br** e o portal em
**https://atendimento.infoxtec.dev.vluma.com.br**), nunca contra `npm run dev`.

## Preparar (cada sessão nova)
1. `export ATOS_SCRATCH=/tmp/atos-scratch && mkdir -p $ATOS_SCRATCH/e2e` e copie esta pasta para `$ATOS_SCRATCH/e2e/`
   (ou rode direto daqui com `ATOS_SCRATCH` apontando para a pasta dos segredos); `cd $ATOS_SCRATCH/e2e && npm i playwright && npx playwright install chromium`.
2. Em `$ATOS_SCRATCH` (NUNCA no git) crie os arquivos de credenciais:
   - `.tk` — token de acesso da Management API do Supabase (projeto vgkiddqahubznlzkxfgb)
   - `.anon` e `.srk` — chaves anon e service_role do projeto (Management API → api-keys)
   - `.cred.json` — `{"super":[email,senha],"admin":[...],"tecnico":[...],"atendente":[...],"portal":[...]}`
     (usuários de teste listados em PROJETO_ATOS.md, "Credenciais a trocar no FIM do MVP")
   - `sql.sh` e `imp.sh` (esta pasta) copiados para `$ATOS_SCRATCH/`
   - fotos de teste: `foto1.png` (64x48) e `foto2.png` (80x60), PNG válidos
3. Rode um teste: `node real.mjs`. Cada script imprime `OK`/`FALHA` e termina com `TUDO OK` ou `N FALHA(S)`.

## Scripts
| Script | O que cobre |
|---|---|
| `real` | login do ATOS (admin, técnico, Super Admin) e portal pelo caminho interno |
| `portal_e1`, `portal_host`, `portal_troca` | E1: configuração, endereço oficial (Cloudflare/Vercel), troca do nome curto |
| `e3_api`, `e3_ui` | E3: convites, aceite, pedidos de acesso, Supervisor, LGPD |
| `e2_admin` → `e2_atendente` → `e2_tecnico` (nessa ordem), `e2_usuarios`, `inativo` | E2: grupos, catálogo, Atendente, técnico, usuários, desativação |
| `e4_avisos`, `e4_ui`, `e4_interno` | E4: avisos por e-mail, abrir/acompanhar chamado, lado interno |
| `turnstile`, `ts_pos` | anti-robô (ts_pos usa a chave de teste da Cloudflare; **restaurar o segredo real depois**) |
| `fumaca` | abre todas as telas existentes procurando erros |

Os roteiros de SQL (rodam por `sql.sh`) ficam em `supabase/tests/`: `seguranca_isolamento.sql`,
`grupos_atendimento.sql`, `portal_chamados.sql`. Regra: todo roteiro novo só é aceito depois de provado com uma
falha plantada (um tratador EXCEPTION no bloco externo já deixou checagens vazias — ver PROJETO_ATOS.md).
