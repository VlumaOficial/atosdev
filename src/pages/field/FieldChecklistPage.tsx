import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useChecklistInstance, temResposta } from '@/hooks/useChecklistInstance'
import ChecklistFillList from '@/components/checklists/ChecklistFillList'
import { useTrabalhoPendente } from '@/lib/trabalhoPendente'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Building2, MapPin } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' }
const STATUS_STYLES: Record<string, string> = {
  pendente: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  em_andamento: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  concluido: 'text-green-400 bg-green-500/10 border-green-500/30',
}

export default function FieldChecklistPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { checklist, loading, salvarResposta, obrigatoriosPendentes, concluir } = useChecklistInstance({ instanceId: id })

  const [respLocal, setRespLocal] = useState<Record<string, any> | null>(null)
  const [itensAbertos, setItensAbertos] = useState<Record<string, boolean>>({})
  const [salvandoProgresso, setSalvandoProgresso] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const [erro, setErro] = useState('')
  // respostas editadas e ainda não salvas: app não pode se atualizar
  useTrabalhoPendente(respLocal !== null || salvandoProgresso || concluindo)

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!checklist) {
    return (
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate('/campo/checklists')} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4"><ArrowLeft size={16} /> Voltar</button>
        <Card className="p-6 text-center text-red-400 text-sm">Checklist não encontrado.</Card>
      </div>
    )
  }

  // inicializa a edição local a partir das respostas já salvas, na primeira renderização
  const respostas = respLocal ?? Object.fromEntries(checklist.items.map(it => [it.id, checklist.answers[it.id]?.value ?? {}]))
  const concluido = checklist.status === 'concluido'
  const pendentesObrig = obrigatoriosPendentes()

  function setCampo(itemId: string, fieldId: string, v: any) {
    setRespLocal({ ...respostas, [itemId]: { ...(respostas[itemId] ?? {}), [fieldId]: v } })
  }

  async function handleSalvarProgresso() {
    setSalvandoProgresso(true)
    setErro('')
    try {
      for (const it of checklist!.items) {
        const val = respostas[it.id]
        if (temResposta(val)) await salvarResposta(it.id, it, val)
      }
    } catch {
      setErro('Não foi possível salvar o progresso.')
    } finally {
      setSalvandoProgresso(false)
    }
  }

  async function handleConcluir() {
    setErro('')
    const faltando = checklist!.items.filter(it => it.is_required && !temResposta(respostas[it.id]))
    if (faltando.length > 0) {
      setErro('Responda todos os itens obrigatórios antes de concluir.')
      return
    }
    setConcluindo(true)
    try {
      for (const it of checklist!.items) {
        const val = respostas[it.id]
        if (temResposta(val)) await salvarResposta(it.id, it, val)
      }
      await concluir()
    } catch {
      setErro('Não foi possível concluir o checklist.')
    } finally {
      setConcluindo(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <button onClick={() => navigate('/campo/checklists')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition mb-4">
        <ArrowLeft size={16} /> Checklists
      </button>

      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={'inline-block px-2.5 py-1 rounded-md text-xs font-medium border ' + STATUS_STYLES[checklist.status]}>{STATUS_LABELS[checklist.status]}</span>
        {checklist.recurrence && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{checklist.recurrence}</span>}
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-3">{checklist.title}</h1>

      {(checklist.client || checklist.location) && (
        <Card className="p-4 mb-4">
          <div className="space-y-2 text-sm">
            {checklist.client && <div className="flex items-center gap-2 text-foreground"><Building2 size={15} className="text-muted-foreground flex-shrink-0" /> {checklist.client.name}</div>}
            {checklist.location && <div className="flex items-center gap-2 text-foreground"><MapPin size={15} className="text-muted-foreground flex-shrink-0" /> {checklist.location.name}</div>}
          </div>
        </Card>
      )}

      {!concluido && pendentesObrig > 0 && <p className="text-xs text-amber-400 mb-3">{pendentesObrig} {pendentesObrig === 1 ? 'item obrigatório pendente' : 'itens obrigatórios pendentes'}</p>}

      <Card className="p-4 mb-4">
        <ChecklistFillList
          items={checklist.items}
          respostas={respostas}
          itensAbertos={itensAbertos}
          onToggleItem={(itemId) => setItensAbertos(prev => ({ ...prev, [itemId]: !prev[itemId] }))}
          onCampo={setCampo}
          onFotoAlterada={(item, val) => { salvarResposta(item.id, item, val).catch(() => {}) }}
          instanceId={checklist.instanceId}
          readOnly={concluido}
        />
      </Card>

      {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">{erro}</div>}

      {!concluido && (
        <div className="space-y-2">
          <Button variant="cta" className="w-full" loading={concluindo} onClick={handleConcluir}>Concluir checklist</Button>
          <Button variant="outline" className="w-full" loading={salvandoProgresso} onClick={handleSalvarProgresso}>Salvar progresso</Button>
        </div>
      )}
    </div>
  )
}
