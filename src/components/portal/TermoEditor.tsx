import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { TIPOS_TERMO, type TipoTermo } from '@/lib/portal'

export interface TermoLinha { id: string; tenant_id: string | null; tipo: TipoTermo; versao: number; titulo: string; texto: string; publicado_em: string }

// Últimas versões dos termos visíveis para quem está logado: padrão VLUMA
// (tenant_id nulo) e, para o admin, os próprios da empresa
export function useTermos() {
  const [linhas, setLinhas] = useState<TermoLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  async function carregar() {
    const { data } = await supabase.from('termos').select('id, tenant_id, tipo, versao, titulo, texto, publicado_em').order('versao', { ascending: false })
    setLinhas((data ?? []) as TermoLinha[])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])
  const ultimo = (tipo: TipoTermo, proprio: boolean) => linhas.find(l => l.tipo === tipo && (proprio ? l.tenant_id !== null : l.tenant_id === null)) ?? null
  return { ultimo, carregando, recarregar: carregar }
}

export function rotuloTermo(tipo: TipoTermo) {
  return TIPOS_TERMO.find(t => t.tipo === tipo)?.rotulo ?? tipo
}

// Publica uma NOVA versão (nunca edita a anterior: quem aceitou a versão
// antiga continua com o registro dela; a nova pede novo aceite)
export function TermoEditorModal({ aberto, onFechar, tipo, padrao, base, onPublicado }: {
  aberto: boolean; onFechar: () => void; tipo: TipoTermo; padrao: boolean
  base: { titulo: string; texto: string } | null; onPublicado: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    if (aberto) { setTitulo(base?.titulo ?? rotuloTermo(tipo)); setTexto(base?.texto ?? ''); setErro('') }
  }, [aberto, base, tipo])

  async function publicar() {
    setSalvando(true)
    setErro('')
    const { error } = await supabase.rpc('publicar_termo', { p_tipo: tipo, p_titulo: titulo, p_texto: texto, p_padrao: padrao })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onPublicado()
    onFechar()
  }

  return (
    <Modal open={aberto} onOpenChange={o => { if (!o) onFechar() }} fecharAoClicarFora={false}
      title={`${padrao ? 'Termo padrão VLUMA' : 'Texto próprio'} — ${rotuloTermo(tipo)}`}
      description="Publicar cria uma nova versão. Quem aceitou a anterior continua com o registro dela, e todos aceitam a nova no próximo acesso."
      className="max-w-2xl">
      <div className="p-5 space-y-3">
        <div>
          <label htmlFor="termo-titulo" className="block text-xs font-medium mb-1">Título</label>
          <input id="termo-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm" />
        </div>
        <div>
          <label htmlFor="termo-texto" className="block text-xs font-medium mb-1">Texto</label>
          <textarea id="termo-texto" value={texto} onChange={e => setTexto(e.target.value)} rows={14}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm leading-relaxed" />
          <p className="text-[11px] text-muted-foreground mt-1">Use <code>{'{{empresa}}'}</code> onde deve aparecer o nome da empresa. Separe parágrafos com uma linha em branco.</p>
        </div>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button variant="cta" loading={salvando} disabled={titulo.trim().length < 3 || texto.trim().length < 20} onClick={publicar}>Publicar nova versão</Button>
        </div>
      </div>
    </Modal>
  )
}

export function TermoLeituraModal({ termo, onFechar }: { termo: TermoLinha | null; onFechar: () => void }) {
  return (
    <Modal open={!!termo} onOpenChange={o => { if (!o) onFechar() }} title={termo ? `${termo.titulo} · versão ${termo.versao}` : ''} className="max-w-2xl">
      <div className="p-5 text-sm text-foreground/90 leading-relaxed">
        {termo?.texto.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-3 whitespace-pre-line">{p}</p>)}
      </div>
    </Modal>
  )
}
