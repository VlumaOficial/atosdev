#!/usr/bin/env python3
"""Preenche locations.cidade_ibge das Unidades antigas (migration 035).

Só preenche quando o nome da cidade + UF batem EXATAMENTE (sem acento e
sem diferença de maiúsculas) com a lista oficial do IBGE (BrasilAPI).
Nada é adivinhado: o que não bate aparece na tela da Unidade com aviso
para o usuário escolher na lista.

Uso:  SUPABASE_ACCESS_TOKEN=... python3 ajustar_cidade_ibge.py <project_ref> [--aplicar]
Sem --aplicar só mostra o que faria. Rodar também na promoção para o PRD.
"""
import json, os, sys, unicodedata, urllib.request

ref = sys.argv[1]
aplicar = '--aplicar' in sys.argv
token = os.environ['SUPABASE_ACCESS_TOKEN']


def sql(q):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref}/database/query',
        data=json.dumps({'query': q}).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
                 'User-Agent': 'atos-ajuste-ibge'})
    return json.load(urllib.request.urlopen(req))


def norm(t):
    t = unicodedata.normalize('NFKD', t or '').encode('ascii', 'ignore').decode()
    return ' '.join(t.upper().replace('-', ' ').split())


cidades = {}
def cidades_da_uf(uf):
    if uf not in cidades:
        url = f'https://brasilapi.com.br/api/ibge/municipios/v1/{uf}?providers=dados-abertos-br,gov,wikipedia'
        req = urllib.request.Request(url, headers={'User-Agent': 'atos-ajuste-ibge'})
        cidades[uf] = {norm(c['nome']): str(c['codigo_ibge']) for c in json.load(urllib.request.urlopen(req))}
    return cidades[uf]


linhas = sql("select id, name, city, state from public.locations where cidade_ibge is null "
             "and coalesce(trim(city), '') <> '' and coalesce(trim(state), '') ~* '^[a-z]{2}$'")
for l in linhas:
    uf = l['state'].strip().upper()
    ibge = cidades_da_uf(uf).get(norm(l['city']))
    print(f"{l['name']!r}: {l['city']!r}/{uf} -> {ibge or 'SEM CORRESPONDÊNCIA (usuário escolhe na tela)'}")
    if ibge and aplicar:
        sql(f"update public.locations set cidade_ibge = '{ibge}', state = '{uf}' where id = '{l['id']}'")
print(f"{len(linhas)} unidade(s) analisada(s){'' if aplicar else ' — nada gravado (use --aplicar)'}")
