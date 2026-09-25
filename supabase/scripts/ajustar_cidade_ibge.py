#!/usr/bin/env python3
"""Ajusta a cidade (código IBGE) das Unidades antigas (migrations 035/036).

1ª passada: preenche locations.cidade_ibge quando o nome da cidade + UF
batem EXATAMENTE (sem acento e sem diferença de maiúsculas) com a lista
oficial do IBGE (BrasilAPI). Nada é adivinhado: o que não bate aparece na
tela com o aviso "sem cidade" para o usuário escolher na lista.
2ª passada: unidades com código IBGE passam a ter o nome oficial da
cidade ("SALVADOR" → "Salvador").

Uso:  SUPABASE_ACCESS_TOKEN=... python3 ajustar_cidade_ibge.py <project_ref> [--aplicar]
Sem --aplicar só mostra o que faria. Rodar também na promoção para o PRD.
"""
import json, os, sys, unicodedata, urllib.request

ref = sys.argv[1]
aplicar = '--aplicar' in sys.argv
token = os.environ['SUPABASE_ACCESS_TOKEN']

UF_POR_CODIGO = {'11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA',
                 '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
                 '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS',
                 '51': 'MT', '52': 'GO', '53': 'DF'}
MINUSCULAS = {'de', 'da', 'do', 'das', 'dos', 'e'}


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


def titulo(n):
    return ' '.join(p if i and p in MINUSCULAS else p[:1].upper() + p[1:] for i, p in enumerate(n.lower().split()))


def esc(t):
    return t.replace("'", "''")


_listas = {}
def lista_uf(uf):
    if uf not in _listas:
        url = f'https://brasilapi.com.br/api/ibge/municipios/v1/{uf}?providers=dados-abertos-br,gov,wikipedia'
        req = urllib.request.Request(url, headers={'User-Agent': 'atos-ajuste-ibge'})
        _listas[uf] = [(str(c['codigo_ibge']), c['nome']) for c in json.load(urllib.request.urlopen(req))]
    return _listas[uf]


# 1ª passada — código IBGE por nome + UF
linhas = sql("select id, name, city, state from public.locations where cidade_ibge is null "
             "and coalesce(trim(city), '') <> '' and coalesce(trim(state), '') ~* '^[a-z]{2}$'")
for l in linhas:
    uf = l['state'].strip().upper()
    ibge = {norm(nome): cod for cod, nome in lista_uf(uf)}.get(norm(l['city']))
    print(f"{l['name']!r}: {l['city']!r}/{uf} -> {ibge or 'SEM CORRESPONDÊNCIA (usuário escolhe na tela)'}")
    if ibge and aplicar:
        sql(f"update public.locations set cidade_ibge = '{ibge}', state = '{uf}' where id = '{l['id']}'")
print(f"1ª passada: {len(linhas)} unidade(s) sem código IBGE analisada(s)")

# 2ª passada — nome oficial da cidade
com_ibge = sql("select id, name, city, cidade_ibge from public.locations where cidade_ibge is not null")
n = 0
for l in com_ibge:
    uf = UF_POR_CODIGO.get(l['cidade_ibge'][:2])
    oficial = next((titulo(nome) for cod, nome in lista_uf(uf) if cod == l['cidade_ibge']), None) if uf else None
    if oficial and l['city'] != oficial:
        n += 1
        print(f"{l['name']!r}: nome da cidade {l['city']!r} -> {oficial!r}")
        if aplicar:
            sql(f"update public.locations set city = '{esc(oficial)}' where id = '{l['id']}'")
print(f"2ª passada: {n} nome(s) de cidade a padronizar{'' if aplicar else ' — nada gravado (use --aplicar)'}")
