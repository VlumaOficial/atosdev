// Recorrência dos checklists avulsos (migration 038). O CÁLCULO das datas
// é do banco (previa_recorrencia / gerar_ocorrencias) — aqui só atalhos,
// resumo em texto e a mesma regra no padrão iCalendar (RRULE).

export type Freq = 'diaria' | 'semanal' | 'mensal' | 'anual'
export interface Regra {
  freq: Freq
  intervalo: number
  dias_uteis?: boolean          // diária: "todo dia útil" (horário padrão + feriados)
  dias_semana?: number[]        // semanal: 0 = domingo
  modo?: 'dia' | 'ordinal'      // mensal
  dia_mes?: number              // 1..31 ou -1 (último dia)
  ordinal?: number              // 1..4 ou -1 (última)
  dia_semana?: number           // mensal por ordinal
  mes?: number                  // anual
  dia?: number                  // anual
}
export type TerminoTipo = 'nunca' | 'apos' | 'em'
export interface Recorrencia {
  regra: Regra
  termino_tipo: TerminoTipo
  termino_qtd: number | null
  termino_data: string | null
}

const DIA_NOME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const DIA_CURTO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const ORD = ['', '1ª', '2ª', '3ª', '4ª']

export function partesData(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { a, m, d, dow, ordinal: Math.ceil(d / 7), ultimaSemana: d + 7 > ultimoDia }
}

function lista(itens: string[]): string {
  return itens.length <= 1 ? itens.join('') : itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1]
}

// "Todo mês, na 2ª terça-feira" — segunda/quinta... com artigo feminino; sábado/domingo masculino
function naDia(dow: number, ordinal: number): string {
  const masc = dow === 0 || dow === 6
  const ord = ordinal === -1 ? (masc ? 'último' : 'última') : ORD[ordinal].replace('ª', masc ? 'º' : 'ª')
  return `${masc ? 'no' : 'na'} ${ord} ${DIA_NOME[dow]}`
}

export function resumoRegra(r: Regra): string {
  const i = r.intervalo || 1
  switch (r.freq) {
    case 'diaria':
      if (r.dias_uteis) return 'Todo dia útil'
      return i === 1 ? 'Todos os dias' : `A cada ${i} dias`
    case 'semanal': {
      const dias = [...(r.dias_semana ?? [])].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))
      if (i === 1 && dias.length === 1) return `${dias[0] === 0 || dias[0] === 6 ? 'Todo' : 'Toda'} ${DIA_CURTO[dias[0]]}`
      const txt = lista(dias.map(d => DIA_CURTO[d]))
      return i === 1 ? `Toda semana: ${txt}` : `A cada ${i} semanas: ${txt}`
    }
    case 'mensal': {
      const cada = i === 1 ? 'Todo mês' : `A cada ${i} meses`
      if (r.modo === 'ordinal') return `${cada}, ${naDia(r.dia_semana ?? 1, r.ordinal ?? 1)}`
      if (r.dia_mes === -1) return `${cada}, no último dia`
      return `${cada}, no dia ${r.dia_mes}${(r.dia_mes ?? 0) >= 29 ? ' (nos meses mais curtos, no último dia)' : ''}`
    }
    case 'anual':
      return `${i === 1 ? 'Todo ano' : `A cada ${i} anos`}, em ${r.dia} de ${MES_NOME[(r.mes ?? 1) - 1]}`
  }
}

export function resumoRecorrencia(rec: Recorrencia): string {
  const base = resumoRegra(rec.regra)
  if (rec.termino_tipo === 'apos' && rec.termino_qtd) return `${base}, ${rec.termino_qtd} ${rec.termino_qtd === 1 ? 'vez' : 'vezes'}`
  if (rec.termino_tipo === 'em' && rec.termino_data) return `${base}, até ${dataBR(rec.termino_data)}`
  return base
}

// Atalhos do campo "Repetir", montados a partir da data de início
export type ChaveAtalho = 'nao' | 'dias_uteis' | 'semanal' | 'mensal_dia' | 'mensal_ord' | 'mensal_ultima' | 'anual' | 'custom'
export function atalhos(inicio: string): { chave: ChaveAtalho; rotulo: string; regra: Regra | null }[] {
  const p = partesData(inicio)
  const l: { chave: ChaveAtalho; rotulo: string; regra: Regra | null }[] = [
    { chave: 'nao', rotulo: 'Não se repete', regra: null },
    { chave: 'dias_uteis', rotulo: 'Todo dia útil', regra: { freq: 'diaria', intervalo: 1, dias_uteis: true } },
    { chave: 'semanal', rotulo: '', regra: { freq: 'semanal', intervalo: 1, dias_semana: [p.dow] } },
    { chave: 'mensal_dia', rotulo: '', regra: { freq: 'mensal', intervalo: 1, modo: 'dia', dia_mes: p.d } },
  ]
  if (p.ordinal <= 4) l.push({ chave: 'mensal_ord', rotulo: '', regra: { freq: 'mensal', intervalo: 1, modo: 'ordinal', ordinal: p.ordinal, dia_semana: p.dow } })
  if (p.ultimaSemana) l.push({ chave: 'mensal_ultima', rotulo: '', regra: { freq: 'mensal', intervalo: 1, modo: 'ordinal', ordinal: -1, dia_semana: p.dow } })
  l.push({ chave: 'anual', rotulo: '', regra: { freq: 'anual', intervalo: 1, mes: p.m, dia: p.d } })
  return l.map(x => ({ ...x, rotulo: x.rotulo || resumoRegra(x.regra!) }))
}

export function mesmaRegra(a: Regra, b: Regra): boolean {
  const n = (r: Regra) => JSON.stringify({ ...r, dias_semana: r.dias_semana ? [...r.dias_semana].sort() : undefined, dias_uteis: r.dias_uteis || undefined })
  return n(a) === n(b)
}

// Mesma regra no padrão iCalendar (registro/exportação futura para agenda)
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
export function regraParaRRule(rec: Recorrencia): string {
  const r = rec.regra
  const p: string[] = []
  if (r.freq === 'diaria' && r.dias_uteis) p.push('FREQ=WEEKLY', 'BYDAY=MO,TU,WE,TH,FR', 'X-ATOS-DIA-UTIL=CALENDARIO')
  else {
    p.push('FREQ=' + { diaria: 'DAILY', semanal: 'WEEKLY', mensal: 'MONTHLY', anual: 'YEARLY' }[r.freq])
    if (r.intervalo > 1) p.push('INTERVAL=' + r.intervalo)
    if (r.freq === 'semanal') p.push('BYDAY=' + (r.dias_semana ?? []).map(d => BYDAY[d]).join(','))
    if (r.freq === 'mensal' && r.modo === 'ordinal') p.push(`BYDAY=${r.ordinal}${BYDAY[r.dia_semana ?? 0]}`)
    if (r.freq === 'mensal' && r.modo === 'dia') {
      if (r.dia_mes === -1) p.push('BYMONTHDAY=-1')
      else if ((r.dia_mes ?? 1) >= 29) p.push('BYMONTHDAY=' + Array.from({ length: (r.dia_mes ?? 29) - 27 }, (_, k) => 28 + k).join(','), 'BYSETPOS=-1')
      else p.push('BYMONTHDAY=' + r.dia_mes)
    }
    if (r.freq === 'anual') {
      p.push('BYMONTH=' + r.mes)
      if ((r.dia ?? 1) >= 29) p.push('BYMONTHDAY=' + Array.from({ length: (r.dia ?? 29) - 27 }, (_, k) => 28 + k).join(','), 'BYSETPOS=-1')
      else p.push('BYMONTHDAY=' + r.dia)
    }
  }
  if (rec.termino_tipo === 'apos' && rec.termino_qtd) p.push('COUNT=' + rec.termino_qtd)
  if (rec.termino_tipo === 'em' && rec.termino_data) p.push('UNTIL=' + rec.termino_data.replace(/-/g, ''))
  return p.join(';')
}

// ---------- datas ----------
export function hojeNoFuso(fuso = 'America/Sao_Paulo'): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: fuso })
}
export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const x = new Date(Date.UTC(a, m - 1, d + n))
  return x.toISOString().slice(0, 10)
}
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
const DOW_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function dataCurtaDia(iso: string): string {
  const p = partesData(iso)
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')} ${DOW_CURTO[p.dow]}`
}

// Situação de uma ocorrência para as listas (técnico e painel)
export type Situacao = 'concluido' | 'atrasado' | 'hoje' | 'proximo'
export function situacaoOcorrencia(c: { status: string; data_prevista?: string | null; prazo?: string | null }, hoje: string): Situacao {
  if (c.status === 'concluido') return 'concluido'
  if (c.prazo && c.prazo < hoje) return 'atrasado'
  if (c.data_prevista && c.data_prevista > hoje) return 'proximo'
  return 'hoje'
}

export function textoPrazo(dias: number): string {
  if (dias <= 1) return 'no mesmo dia'
  if (dias === 2) return 'até o dia seguinte'
  return `em até ${dias} dias`
}
