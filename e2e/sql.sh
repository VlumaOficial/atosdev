#!/bin/bash
S=${ATOS_SCRATCH:-/tmp/atos-scratch}
if [ "$1" = "-c" ]; then Q="$2"; else Q=$(cat "$1"); fi
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$Q" > $S/.q.json
curl -s -X POST "https://api.supabase.com/v1/projects/vgkiddqahubznlzkxfgb/database/query" \
  -H "Authorization: Bearer $(cat $S/.tk)" -H "Content-Type: application/json" --data @$S/.q.json
echo
