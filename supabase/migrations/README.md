# Nota sobre as migrations 004–015

Até 2026-09-22, as migrations 004 em diante **nunca foram salvas como
arquivo** — todo o SQL depois da migration 003 foi colado diretamente
no SQL Editor do Supabase Dashboard, sem passar pelo CLI. O histórico
de migrations do banco remoto (`supabase_migrations.schema_migrations`)
está vazio até hoje, mesmo para as migrations 001–003.

Os arquivos 004–015 foram **reconstruídos por introspecção do schema
real do projeto DEV** (`vgkiddqahubznlzkxfgb`), via Management API
(consultas a `information_schema`/`pg_catalog`), e não são uma cópia
literal do SQL original executado por fase. O resultado final é
equivalente ao estado atual do banco, mas o agrupamento por arquivo
segue as fases descritas no `PROJETO_ATOS.md`, não o histórico exato
de comandos.

**Use estes arquivos para:**
- Recriar o schema do zero (novo ambiente, disaster recovery)
- Aplicar em PRD (`zeejmwdyqrbjnkhwtdsu`) com paridade real ao DEV

**A partir de agora:** toda alteração de schema deve virar um arquivo
de migration novo no repositório *antes* (ou logo após) de ser
aplicada no Dashboard, para não repetir esse gap.
