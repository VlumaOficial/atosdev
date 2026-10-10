#!/bin/bash
# Roda testes que enviam o "Solicitar acesso" público (e3_api, e3_ui) trocando TEMPORARIAMENTE o antirrobô pelas chaves
# de TESTE da Cloudflare e RESTAURANDO as reais no fim (mesmo se o teste falhar). Uso: ./com_antirobo_de_teste.sh e3_api e3_ui
# Precisa, em $ATOS_SCRATCH: .tk (token Supabase), .ts_secret (chave secreta real do Turnstile) e sql.sh.
S=${ATOS_SCRATCH:?defina ATOS_SCRATCH}; cd "$(dirname "$0")"
REAL_SECRET=$(cat $S/.ts_secret); REAL_KEY=$($S/sql.sh -c "select turnstile_site_key from portal_plataforma" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['turnstile_site_key'])")
SB="/home/sdorea/.local/bin/supabase"; REF=vgkiddqahubznlzkxfgb
restaurar() { SUPABASE_ACCESS_TOKEN=$(cat $S/.tk) $SB secrets set TURNSTILE_SECRET="$REAL_SECRET" --project-ref $REF >/dev/null 2>&1; $S/sql.sh -c "update portal_plataforma set turnstile_site_key='$REAL_KEY'" >/dev/null; echo "[chaves reais restauradas]"; }
trap restaurar EXIT
SUPABASE_ACCESS_TOKEN=$(cat $S/.tk) $SB secrets set TURNSTILE_SECRET=1x0000000000000000000000000000000AA --project-ref $REF >/dev/null 2>&1
$S/sql.sh -c "update portal_plataforma set turnstile_site_key='1x00000000000000000000AA'" >/dev/null
sleep 8
for t in "$@"; do echo "=== $t"; node $t.mjs 2>&1 | grep -E "FALHA|TUDO OK|Error|erros: \[.+|TimeoutError" | head -6; done
