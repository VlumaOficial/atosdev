import { supabase } from '@/lib/supabase'

// Chamados do portal (E4, migration 061) — tipos, rótulos e envio de anexos

export type StatusCliente = 'recebido' | 'agendado' | 'em_atendimento' | 'resolvido' | 'cancelado'
export const STATUS_CLIENTE: Record<StatusCliente, { rotulo: string; cor: string; ordem: number }> = {
  recebido: { rotulo: 'Recebido', cor: 'text-blue-400 bg-blue-500/10 border-blue-500/30', ordem: 1 },
  agendado: { rotulo: 'Agendado', cor: 'text-purple-400 bg-purple-500/10 border-purple-500/30', ordem: 2 },
  em_atendimento: { rotulo: 'Em atendimento', cor: 'text-amber-400 bg-amber-500/10 border-amber-500/30', ordem: 3 },
  resolvido: { rotulo: 'Resolvido', cor: 'text-green-400 bg-green-500/10 border-green-500/30', ordem: 4 },
  cancelado: { rotulo: 'Cancelado', cor: 'text-muted-foreground bg-secondary border-border', ordem: 5 },
}

export interface ItemChamado {
  id: string; numero: string; titulo: string; tipo: string; status: StatusCliente; criado_em: string; atualizado_em: string
  cliente: string; unidade: string | null; categoria: string | null; meu: boolean; solicitante: string | null; afetados: number
  aguardando_voce?: boolean
}
export interface ListaChamados {
  total: number
  contagens: { abertos: number; resolvidos_mes: number; todos: number; aguardando_voce?: number }
  itens: ItemChamado[]
}
export interface AnexoChamado { id: string; path: string; nome: string; tipo: 'foto' | 'audio'; mime: string; bytes: number }
export interface MensagemChamado { id: string; em: string; autor: 'empresa' | 'cliente'; nome: string; texto: string; anexos: AnexoChamado[] }
export interface DetalheChamado {
  id: string; client_id: string; numero: string; titulo: string; descricao: string | null; tipo: string; status: StatusCliente
  criado_em: string; atualizado_em: string; cliente: string; unidade: string | null
  categoria: { nome: string; pai: string | null } | null
  solicitante: string | null; meu: boolean; equipe: string | null; compartilhado: boolean
  agendado_para: string | null; tecnico: string | null
  preferencias: { data: string; periodo: string }[] | null
  afetados: number; eu_afetado: boolean
  anexos: AnexoChamado[]
  mensagens: MensagemChamado[]; pode_responder: boolean
  agendamento: AgendamentoChamado | null
  config_agendamento: ConfigAgendamento
  relacionada: { id: string; numero: string } | null
  derivados: { id: string; numero: string; tipo: string }[]
  cancelamento: { texto: string; ausente: boolean; pode_pedir_nova_visita: boolean } | null
  prazos: { nivel: 'previsao' | 'completo'; atendimento: string | null; solucao: string | null; pausado: boolean; situacao: 'no_prazo' | 'fora_do_prazo' | 'pausado' | null } | null
  aguardando_voce: boolean
  pausa: { tipo: 'aciona' | 'comunica'; texto: string; desde?: string | null; previsao?: string | null } | null
  linha_do_tempo: { evento: string; em: string; para: string | null; detalhe?: { de?: string | null; para?: string | null; motivo?: string | null; assunto?: string | null; texto?: string | null; tipo?: string | null; para_sla?: boolean | null; previsao?: string | null; a_pedido_do_cliente?: boolean | null; reagendado?: boolean | null } | null }[]
  contatos: { email?: string; telefone?: string; whatsapp?: string; site?: string } | null
}

export const ROTULO_EVENTO: Record<string, string> = {
  created: 'Chamado registrado', scheduled: 'Atendimento agendado', started: 'Atendimento iniciado',
  completed: 'Chamado resolvido', cancelled: 'Chamado cancelado', reopened: 'Chamado reaberto', reclassified: 'Chamado reclassificado',
  paused: 'Chamado em pausa', resumed: 'Atendimento retomado',
}
export const ROTULO_PRIORIDADE: Record<string, string> = { critico: 'Crítico', alto: 'Alto', baixo: 'Baixo' }
export interface ConfigAgendamento {
  antecedencia_horas: number; horizonte_dias: number; data_minima: string; data_maxima: string
  janelas: { manha: { nome: string; inicio: string; fim: string }; tarde: { nome: string; inicio: string; fim: string } }
}
// nomes das janelas como a empresa configurou ("Manhã (08:00–12:00)")
export function rotulosPeriodo(c?: ConfigAgendamento | null): Record<string, string> {
  if (!c) return { manha: 'Manhã', tarde: 'Tarde', qualquer: 'Qualquer horário' }
  return { manha: `${c.janelas.manha.nome} (${c.janelas.manha.inicio}–${c.janelas.manha.fim})`, tarde: `${c.janelas.tarde.nome} (${c.janelas.tarde.inicio}–${c.janelas.tarde.fim})`, qualquer: 'Qualquer horário' }
}
export interface AgendamentoChamado {
  status: 'proposto' | 'confirmado' | 'reagendamento_pedido' | null; para: string | null
  pedido: { data: string; periodo: string }[] | null; motivo_pedido: string | null; confirmado_em: string | null
  pode_aceitar: boolean; pode_pedir_outra: boolean; pode_cancelar: boolean; motivo_obrigatorio: boolean
  reagendamentos_usados: number; reagendamentos_limite: number; reagendar_antecedencia_horas: number; cancelar_antecedencia_horas: number; cliente_reagenda: boolean
  config: ConfigAgendamento
}
export const ROTULO_PERIODO: Record<string, string> = { manha: 'de manhã', tarde: 'à tarde', qualquer: 'qualquer horário' }

export function dataHoraBR(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}
export function dataBR(iso?: string | null): string {
  if (!iso) return ''
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

// ---------- anexos: fotos reduzidas e áudio ----------
export const MAX_ANEXOS = 5
export const MAX_AUDIO_SEG = 120

async function reduzirFoto(file: File): Promise<Blob> {
  const MAX = 1600
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file, { resizeWidth: MAX, resizeQuality: 'medium' }) } catch { bmp = await createImageBitmap(file) }
  const escala = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Não foi possível processar a foto.'))), 'image/jpeg', 0.82))
}

export interface AnexoLocal { id: string; nome: string; tipo: 'foto' | 'audio'; blob: Blob; mime: string; url: string }

export async function prepararFoto(file: File): Promise<AnexoLocal> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  let blob: Blob
  try { blob = await reduzirFoto(file) } catch { throw new Error('Não foi possível ler esta imagem. Tente outra foto.') }
  return { id: crypto.randomUUID(), nome: file.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'foto', blob, mime: 'image/jpeg', url: URL.createObjectURL(blob) }
}
export function prepararAudio(blob: Blob, nome = 'audio'): AnexoLocal {
  const base = (blob.type || 'audio/webm').split(';')[0]
  const ext = base.includes('mp4') || base.includes('aac') || base.includes('m4a') ? 'm4a' : base.includes('ogg') ? 'ogg' : base.includes('mpeg') ? 'mp3' : base.includes('wav') ? 'wav' : 'webm'
  return { id: crypto.randomUUID(), nome: `${nome}.${ext}`, tipo: 'audio', blob, mime: base, url: URL.createObjectURL(blob) }
}

// Envia os anexos para a pasta da própria pessoa; devolve os dados que a abertura do chamado registra
export async function enviarAnexos(tenantId: string, clientId: string, userId: string, anexos: AnexoLocal[]) {
  const enviados: { path: string; nome: string; tipo: string; mime: string; bytes: number }[] = []
  try {
    for (const a of anexos) {
      if (a.blob.size > 10 * 1024 * 1024) throw new Error(`"${a.nome}" é grande demais (máximo 10 MB).`)
      const ext = a.nome.split('.').pop() || 'bin'
      const path = `${tenantId}/${clientId}/${userId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('portal-anexos').upload(path, a.blob, { contentType: a.mime, upsert: false })
      if (error) throw new Error(`Não foi possível enviar "${a.nome}": ${error.message}`)
      enviados.push({ path, nome: a.nome, tipo: a.tipo, mime: a.mime, bytes: a.blob.size })
    }
  } catch (e) {
    if (enviados.length) await supabase.storage.from('portal-anexos').remove(enviados.map(x => x.path))   // não deixa rascunho para trás
    throw e
  }
  return enviados
}

export async function urlAssinada(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('portal-anexos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
