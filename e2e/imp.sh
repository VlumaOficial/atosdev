#!/bin/bash
# uso: imp.sh <uid> "<sql que termina num select>"  — roda como o usuário e desfaz
S=${ATOS_SCRATCH:-/tmp/atos-scratch}
$S/sql.sh -c "begin; set local role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true); $2; rollback;"
