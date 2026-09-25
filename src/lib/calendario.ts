// Módulo Calendários (migration 035) — tipos e utilitários compartilhados
// entre a página Calendários, Configurações (fuso) e Unidades (cidade +
// horário de funcionamento). As REGRAS de tempo (dia útil, horas úteis)
// ficam no banco — aqui só formatação e edição.

// Semana: chaves "0".."6" (0 = domingo), intervalos ["HH:MM","HH:MM"]
export type Intervalo = [string, string]
export type Semana = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', Intervalo[]>>

export const DIAS = [
  { k: '1', curto: 'Seg', longo: 'Segunda' },
  { k: '2', curto: 'Ter', longo: 'Terça' },
  { k: '3', curto: 'Qua', longo: 'Quarta' },
  { k: '4', curto: 'Qui', longo: 'Quinta' },
  { k: '5', curto: 'Sex', longo: 'Sexta' },
  { k: '6', curto: 'Sáb', longo: 'Sábado' },
  { k: '0', curto: 'Dom', longo: 'Domingo' },
] as const

const DIAS_UTEIS: Array<keyof Semana> = ['1', '2', '3', '4', '5']
const TODOS: Array<keyof Semana> = ['0', '1', '2', '3', '4', '5', '6']

function montar(dias: Array<keyof Semana>, intervalos: Intervalo[]): Semana {
  const s: Semana = {}
  dias.forEach(d => { s[d] = intervalos.map(i => [...i] as Intervalo) })
  return s
}

export const MODELOS_SEMANA: { nome: string; descricao: string; semana: Semana }[] = [
  { nome: 'Comercial', descricao: 'Seg–Sex 08:00–18:00', semana: montar(DIAS_UTEIS, [['08:00', '18:00']]) },
  { nome: 'Comercial com almoço', descricao: 'Seg–Sex 08–12 e 13–18', semana: montar(DIAS_UTEIS, [['08:00', '12:00'], ['13:00', '18:00']]) },
  { nome: 'Estendido', descricao: 'Seg–Sáb 07:00–22:00', semana: montar(['1', '2', '3', '4', '5', '6'], [['07:00', '22:00']]) },
  { nome: '24x7', descricao: 'Todos os dias, 24 horas', semana: montar(TODOS, [['00:00', '24:00']]) },
]

function paraMin(h: string): number {
  const [a, b] = h.split(':').map(Number)
  return a * 60 + b
}

// Mesmas regras de public.fn_semana_valida — erro amigável antes de salvar
export function validarSemana(s: Semana): string | null {
  for (const d of DIAS) {
    const lista = s[d.k] ?? []
    let ult = -1
    for (const [ini, fim] of lista) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(ini) || !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(fim)) {
        return `${d.longo}: preencha os horários (HH:MM).`
      }
      if (paraMin(fim) <= paraMin(ini)) return `${d.longo}: o fim (${fim}) precisa ser depois do início (${ini}).`
      if (paraMin(ini) < ult) return `${d.longo}: os intervalos se sobrepõem.`
      ult = paraMin(fim)
    }
  }
  return null
}

export function ordenarSemana(s: Semana): Semana {
  const r: Semana = {}
  for (const d of DIAS) {
    const lista = (s[d.k] ?? []).slice().sort((a, b) => paraMin(a[0]) - paraMin(b[0]))
    if (lista.length) r[d.k] = lista
  }
  return r
}

function textoIntervalos(l: Intervalo[]): string {
  if (l.length === 1 && l[0][0] === '00:00' && l[0][1] === '24:00') return '24 horas'
  return l.map(([a, b]) => `${a}–${b}`).join(' e ')
}

// "Seg–Sex 08:00–18:00 · Sáb 08:00–12:00" — agrupa dias seguidos iguais
export function resumoSemana(s: Semana | null | undefined): string {
  if (!s) return 'Não informado'
  const partes: string[] = []
  let i = 0
  while (i < DIAS.length) {
    const atual = s[DIAS[i].k] ?? []
    if (!atual.length) { i++; continue }
    const txt = textoIntervalos(atual)
    let j = i
    while (j + 1 < DIAS.length && textoIntervalos(s[DIAS[j + 1].k] ?? []) === txt && (s[DIAS[j + 1].k] ?? []).length) j++
    const dias = j === i ? DIAS[i].curto : j === i + 1 ? `${DIAS[i].curto} e ${DIAS[j].curto}` : `${DIAS[i].curto}–${DIAS[j].curto}`
    partes.push(`${dias} ${txt}`)
    i = j + 1
  }
  if (!partes.length) return 'Sem expediente'
  if (partes.length === 1 && partes[0] === 'Seg–Dom 24 horas') return 'Todos os dias, 24 horas'
  return partes.join(' · ')
}

// ---------- fuso ----------
export const FUSOS = [
  { value: 'America/Sao_Paulo', label: 'Horário de Brasília (UTC−3)' },
  { value: 'America/Manaus', label: 'Amazonas, RO, RR, MT, MS (UTC−4)' },
  { value: 'America/Rio_Branco', label: 'Acre e oeste do AM (UTC−5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC−2)' },
]

// ---------- UF / cidades (IBGE via BrasilAPI — gratuita, sem chave) ----------
export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE',
  'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

const UF_POR_CODIGO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI',
  '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES',
  '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}
export function ufDoIbge(ibge: string | null | undefined): string | null {
  return ibge ? UF_POR_CODIGO[ibge.slice(0, 2)] ?? null : null
}

export interface Cidade { nome: string; ibge: string }

// "FEIRA DE SANTANA" → "Feira de Santana"
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"])
export function nomeCidade(txt: string): string {
  return txt.toLowerCase().split(' ').map((p, i) =>
    i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

const cacheCidades = new Map<string, Promise<Cidade[]>>()
export function cidadesDaUf(uf: string): Promise<Cidade[]> {
  if (!cacheCidades.has(uf)) {
    const p = fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}?providers=dados-abertos-br,gov,wikipedia`)
      .then(r => { if (!r.ok) throw new Error('Falha ao buscar cidades'); return r.json() })
      .then((l: { nome: string; codigo_ibge: string }[]) =>
        l.map(c => ({ nome: nomeCidade(c.nome), ibge: String(c.codigo_ibge) }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    p.catch(() => cacheCidades.delete(uf))
    cacheCidades.set(uf, p)
  }
  return cacheCidades.get(uf)!
}

// ---------- feriados ----------
export type Abrangencia = 'nacional' | 'estadual' | 'municipal' | 'empresa'
export type TipoFeriado = 'feriado' | 'facultativo' | 'reduzido'
export type Efeito = 'folga' | 'normal' | 'reduzido'

export interface Feriado {
  id: string
  tenant_id: string | null
  data: string
  anual: boolean
  nome: string
  abrangencia: Abrangencia
  uf: string | null
  cidade_ibge: string | null
  cidade: string | null
  tipo: TipoFeriado
  janela_inicio: string | null
  janela_fim: string | null
}

export const ROTULO_TIPO: Record<TipoFeriado, string> = {
  feriado: 'Feriado', facultativo: 'Ponto facultativo', reduzido: 'Expediente reduzido',
}
export const ROTULO_EFEITO: Record<Efeito, string> = {
  folga: 'Sem expediente', normal: 'Expediente normal', reduzido: 'Expediente reduzido',
}
export function efeitoPadrao(t: TipoFeriado): Efeito {
  return t === 'feriado' ? 'folga' : t === 'facultativo' ? 'normal' : 'reduzido'
}
export function hhmm(t: string | null): string {
  if (!t) return ''
  return t.startsWith('24') ? '24:00' : t.slice(0, 5)
}
export function textoJanela(f: Pick<Feriado, 'janela_inicio' | 'janela_fim'>): string {
  if (!f.janela_inicio) return ''
  const ini = hhmm(f.janela_inicio), fim = hhmm(f.janela_fim)
  if (ini === '00:00') return `até ${fim}`
  if (fim === '24:00') return `a partir das ${ini}`
  return `das ${ini} às ${fim}`
}
export function rotuloAbrangencia(f: Pick<Feriado, 'abrangencia' | 'uf' | 'cidade'>): string {
  if (f.abrangencia === 'nacional') return 'Nacional'
  if (f.abrangencia === 'estadual') return `Estadual · ${f.uf}`
  if (f.abrangencia === 'municipal') return `${f.cidade ?? 'Municipal'} · ${f.uf}`
  return 'Da empresa'
}

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
// "12/10 · seg" (data pura, sem fuso)
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} · ${DIA_SEMANA[dow]}`
}

// Situação de um dia (public.situacao_do_dia)
export interface SituacaoDia {
  dia_util: boolean
  periodos: Intervalo[]
  feriados: { nome: string; abrangencia: Abrangencia; tipo: TipoFeriado; efeito: Efeito }[]
  considera_feriados: boolean
}
