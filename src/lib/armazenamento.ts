import { supabase } from '@/lib/supabase'

// Garantia de "nenhuma foto órfã" no bucket evidencias (auditoria de
// armazenamento, 2026-09-23). Duas camadas:
//  1. Prevenção — quem exclui OS/checklist apaga os arquivos daquela
//     pasta na hora (removerArquivosDaOS / removerArquivosDoChecklist)
//  2. Rede de segurança — varredura automática (varrerOrfaosSeDevido),
//     no máximo a cada 12h, quando um admin usa o painel. Só apaga o que
//     está sem referência há mais de 1h, pra nunca pegar um upload em
//     andamento (arquivo já subiu, registro ainda não foi gravado)
// A detecção fica no banco (função arquivos_orfaos, migration 024); a
// remoção passa pela Storage API — SQL direto não apaga o arquivo físico.

const BUCKET = 'evidencias'
const LOTE = 100
const INTERVALO_VARREDURA_MS = 12 * 60 * 60 * 1000
const CHAVE_ULTIMA_VARREDURA = 'atos_ultima_varredura_orfaos'

async function removerEmLotes(nomes: string[]): Promise<number> {
  let removidos = 0
  for (let i = 0; i < nomes.length; i += LOTE) {
    const lote = nomes.slice(i, i + LOTE)
    const { error } = await supabase.storage.from(BUCKET).remove(lote)
    if (!error) removidos += lote.length
  }
  return removidos
}

async function meuTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  return data?.tenant_id ?? null
}

async function listarPasta(prefixo: string): Promise<string[]> {
  const { data } = await supabase.storage.from(BUCKET).list(prefixo, { limit: 1000 })
  return (data ?? []).filter(f => f.id).map(f => `${prefixo}/${f.name}`)
}

export async function removerArquivosDoChecklist(instanceId: string): Promise<void> {
  const tenant = await meuTenantId()
  if (!tenant) return
  await removerEmLotes(await listarPasta(`${tenant}/checklist/${instanceId}`))
}

// Chamar ANTES de excluir a OS com os ids dos checklists dela (depois da
// exclusão em cascata não dá mais pra descobrir quais eram)
export async function removerArquivosDaOS(orderId: string, checklistIds: string[]): Promise<void> {
  const tenant = await meuTenantId()
  if (!tenant) return
  const nomes = [
    ...(await listarPasta(`${tenant}/os/${orderId}`)),
    `${tenant}/assinaturas/${orderId}.png`,
  ]
  for (const id of checklistIds) nomes.push(...(await listarPasta(`${tenant}/checklist/${id}`)))
  await removerEmLotes(nomes)
}

export async function limparOrfaos(minIdadeMinutos = 60): Promise<number> {
  const { data, error } = await supabase.rpc('arquivos_orfaos', { p_min_idade_minutos: minIdadeMinutos })
  if (error || !data?.length) return 0
  return removerEmLotes((data as { nome: string }[]).map(r => r.nome))
}

export async function varrerOrfaosSeDevido(): Promise<void> {
  try {
    const ultima = Number(localStorage.getItem(CHAVE_ULTIMA_VARREDURA) ?? 0)
    if (Date.now() - ultima < INTERVALO_VARREDURA_MS) return
    localStorage.setItem(CHAVE_ULTIMA_VARREDURA, String(Date.now()))
  } catch {
    // sem localStorage (aba anônima etc.): varre mesmo assim, é idempotente
  }
  await limparOrfaos(60).catch(() => 0)
}

export interface UsoArmazenamento {
  tenant_id: string
  tenant_nome: string
  usuario_id: string | null
  usuario_nome: string | null
  usuario_role: string | null
  fotos: number
  arquivos: number
  bytes: number
}

export async function usoArmazenamento(): Promise<UsoArmazenamento[]> {
  const { data, error } = await supabase.rpc('uso_armazenamento')
  if (error) throw error
  return (data ?? []) as UsoArmazenamento[]
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`
}
