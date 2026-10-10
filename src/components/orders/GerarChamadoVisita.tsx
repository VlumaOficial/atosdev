import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCategorias } from '@/hooks/useCatalogoSla'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'

// Visita gera chamado (E5b): da Visita a equipe cria um Incidente ou uma Requisição LIGADOS ("relacionada a").
const campo = 'w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

export default function GerarChamadoVisita({ order, caminho }: { order: { id: string; number: string; title: string; tipo: string; status: string }; caminho: string }) {
  const navigate = useNavigate()
  const { opcoes } = useCategorias()
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<'incidente' | 'requisicao'>('incidente')
  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (order.tipo !== 'visita' || order.status === 'cancelada') return null

  async function criar() {
    setErro(''); setSalvando(true)
    const { data, error } = await supabase.rpc('os_gerar_chamado', { p_order: order.id, p_tipo: tipo, p_titulo: titulo.trim(), p_descricao: desc.trim(), p_categoria: cat || null })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setAberto(false); navigate(caminho + (data as any).id)
  }
  return (
    <>
      <button type="button" onClick={() => { setTitulo(`Serviço da visita ${order.number}`); setDesc(''); setCat(''); setErro(''); setAberto(true) }} data-testid="gerar-chamado"
        className="w-full px-3 py-2 rounded-md text-sm font-medium border border-primary/40 text-primary hover:bg-primary/10 inline-flex items-center justify-center gap-2"><FilePlus2 size={15} /> Gerar chamado a partir da visita</button>
      <Modal open={aberto} onOpenChange={setAberto} title="Gerar chamado" description={`Cria um chamado ligado à visita ${order.number}, com o mesmo cliente, unidade e solicitante.`}>
        <div className="space-y-3 p-1" data-testid="form-gerar-chamado">
          <div><Label htmlFor="gc-tipo">O que encontramos?</Label>
            <select id="gc-tipo" value={tipo} onChange={e => setTipo(e.target.value as any)} className={campo}>
              <option value="incidente">Incidente — algo parou ou está com defeito</option>
              <option value="requisicao">Requisição — instalação, troca ou serviço pedido</option>
            </select></div>
          <div><Label htmlFor="gc-titulo">Título *</Label><input id="gc-titulo" value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)} className={campo} /></div>
          <div><Label htmlFor="gc-desc">Descrição *</Label><textarea id="gc-desc" rows={4} maxLength={4000} value={desc} onChange={e => setDesc(e.target.value)} className={campo} placeholder="O que foi visto na visita e o que precisa ser feito" /></div>
          <div><Label htmlFor="gc-cat">Assunto (opcional)</Label>
            <select id="gc-cat" value={cat} onChange={e => setCat(e.target.value)} className={campo}><option value="">Sem assunto (vai para a fila de entrada)</option>{opcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          {erro && <p className="text-xs text-red-400" role="alert" data-testid="erro-gerar-chamado">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="button" variant="cta" size="sm" loading={salvando} onClick={criar} data-testid="confirmar-gerar-chamado">Gerar chamado</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
