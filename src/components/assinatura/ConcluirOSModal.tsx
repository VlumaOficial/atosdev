import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import QuadroAssinatura, { type QuadroAssinaturaRef } from '@/components/assinatura/QuadroAssinatura'
import { checklistObrigatoriosPendentes } from '@/lib/checklistGuard'
import { uploadAssinatura, urlAssinatura } from '@/lib/uploadSignature'
import { urlMinhaAssinatura, salvarMinhaAssinatura, aplicarAssinaturaResponsavel } from '@/lib/assinaturaResponsavel'
import { registrarEvento } from '@/lib/orderEvents'
import { Loader2 } from 'lucide-react'

// Modal ÚNICO de encerramento da OS (técnico no campo e admin no painel).
// Decisões 2026-09-24: a assinatura do CLIENTE é coletada aqui e gravada
// junto com a conclusão (não existe mais "assinatura desenhada mas não
// salva"); a do RESPONSÁVEL vem do perfil (ou é desenhada aqui na
// primeira vez e fica salva); "Cliente não pôde assinar" com motivo só
// se a empresa permitir. O banco também barra conclusão sem assinatura
// quando exigida (migration 028).

interface OrderMin {
  id: string
  signature_path: string | null
  signer_name: string | null
  require_signature?: boolean | null
}

interface Props {
  open: boolean
  order: OrderMin
  onClose: () => void
  onConcluir: (extra: { completion_notes: string | null; completed_at?: string; signature_absent_reason?: string | null }) => Promise<void>
}

export default function ConcluirOSModal({ open, order, onClose, onConcluir }: Props) {
  const { tenant } = useAuth()
  const exige = !!(order.require_signature ?? tenant?.require_signature_to_complete)
  const permiteExcecao = !!(tenant as any)?.allow_signature_exception

  const [relato, setRelato] = useState('')
  const [dataConclusao, setDataConclusao] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [semAssinatura, setSemAssinatura] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [assinaturaCliente, setAssinaturaCliente] = useState<string | null>(null)
  const [minhaAssinatura, setMinhaAssinatura] = useState<string | null | undefined>(undefined) // undefined = carregando
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const quadroCliente = useRef<QuadroAssinaturaRef>(null)
  const quadroResponsavel = useRef<QuadroAssinaturaRef>(null)

  useEffect(() => {
    if (!open) return
    setRelato(''); setDataConclusao(''); setNomeCliente(''); setSemAssinatura(false); setMotivo(''); setErro('')
    setMinhaAssinatura(undefined)
    urlMinhaAssinatura().then(setMinhaAssinatura)
    if (order.signature_path) urlAssinatura(order.signature_path).then(setAssinaturaCliente)
    else setAssinaturaCliente(null)
  }, [open, order.signature_path])

  async function concluir() {
    setErro('')
    if (dataConclusao && new Date(dataConclusao).getTime() > Date.now()) { setErro('A data de conclusão não pode ser no futuro.'); return }

    const clienteDesenhou = !!quadroCliente.current && !quadroCliente.current.vazio()
    if (!order.signature_path) {
      if (semAssinatura) {
        if (!motivo.trim()) { setErro('Informe o motivo de o cliente não ter assinado.'); return }
      } else if (clienteDesenhou) {
        if (!nomeCliente.trim()) { setErro('Informe o nome de quem assinou.'); return }
      } else if (exige) {
        setErro(permiteExcecao
          ? 'Colete a assinatura do cliente ou marque "Cliente não pôde assinar" com o motivo.'
          : 'Colete a assinatura do cliente para concluir o atendimento.')
        return
      }
    }
    const responsavelDesenhou = !!quadroResponsavel.current && !quadroResponsavel.current.vazio()
    if (!minhaAssinatura && !responsavelDesenhou) { setErro('Desenhe a sua assinatura de responsável (ela fica salva para as próximas OS).'); return }

    setSalvando(true)
    try {
      const pendentes = await checklistObrigatoriosPendentes(order.id)
      if (pendentes > 0) {
        setErro(`Conclua o checklist obrigatório antes de finalizar (${pendentes} ${pendentes === 1 ? 'item pendente' : 'itens pendentes'}).`)
        return
      }
      // 1) assinatura do cliente
      if (!order.signature_path && !semAssinatura && clienteDesenhou) {
        const r = await uploadAssinatura(quadroCliente.current!.dataUrl(), order.id, nomeCliente.trim())
        if (r.erro) { setErro(r.erro); return }
      }
      // 2) assinatura do responsável (perfil → OS)
      if (!minhaAssinatura && responsavelDesenhou) {
        const r = await salvarMinhaAssinatura(quadroResponsavel.current!.dataUrl())
        if (r.erro) { setErro(r.erro); return }
      }
      const rResp = await aplicarAssinaturaResponsavel(order.id)
      if (rResp.erro) { setErro(rResp.erro); return }
      // 3) conclusão (o banco confere a regra de assinatura de novo)
      const reason = !order.signature_path && semAssinatura ? motivo.trim() : null
      await onConcluir({
        completion_notes: relato.trim() || null,
        ...(dataConclusao ? { completed_at: new Date(dataConclusao).toISOString() } : {}),
        signature_absent_reason: reason,
      })
      if (reason) await registrarEvento(order.id, 'signature_absent', { reason })
      onClose()
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível concluir o atendimento.')
    } finally {
      setSalvando(false)
    }
  }

  const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition'

  return (
    <Modal open={open} onOpenChange={o => { if (!o && !salvando) onClose() }} title="Concluir atendimento"
      description="Relato, assinatura do cliente e do responsável" className="max-w-lg">
      <div className="space-y-5">
        <div>
          <Label htmlFor="relato">Relato do atendimento</Label>
          <textarea id="relato" value={relato} onChange={e => setRelato(e.target.value)} placeholder="Descreva o que foi realizado" rows={3} className={campo + ' resize-none'} />
        </div>
        <div>
          <Label htmlFor="cdate">Data/hora da conclusão</Label>
          <input id="cdate" type="datetime-local" value={dataConclusao} onChange={e => setDataConclusao(e.target.value)} className={campo} />
          <p className="text-xs text-muted-foreground mt-1">Deixe em branco para usar o horário atual.</p>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">
            Assinatura do cliente {exige && !order.signature_path && <span className="text-red-400">*</span>}
          </p>
          {order.signature_path ? (
            <div className="mt-2">
              {assinaturaCliente && <img src={assinaturaCliente} alt="Assinatura do cliente" className="max-h-24 rounded-md border border-border bg-white" />}
              <p className="text-xs text-muted-foreground mt-1">Já assinada por {order.signer_name}</p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {!semAssinatura && (
                <>
                  <div>
                    <Label htmlFor="nome-cliente">Nome de quem assina</Label>
                    <Input id="nome-cliente" value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome do cliente/responsável no local" />
                  </div>
                  <QuadroAssinatura ref={quadroCliente} rotulo="Assinatura do cliente" />
                </>
              )}
              {permiteExcecao && (
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={semAssinatura} onChange={e => setSemAssinatura(e.target.checked)} className="w-4 h-4 accent-[hsl(var(--primary))]" />
                  Cliente não pôde assinar
                </label>
              )}
              {semAssinatura && (
                <div>
                  <Label htmlFor="motivo">Motivo *</Label>
                  <textarea id="motivo" value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Ex.: responsável ausente no local; cliente se recusou a assinar" className={campo + ' resize-none'} />
                  <p className="text-xs text-amber-400 mt-1">Fica registrado na linha do tempo e em destaque no relatório.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Assinatura do responsável</p>
          {minhaAssinatura === undefined && <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando...</div>}
          {minhaAssinatura && (
            <div className="mt-2">
              <img src={minhaAssinatura} alt="Sua assinatura" className="max-h-20 rounded-md border border-border bg-white" />
              <p className="text-xs text-muted-foreground mt-1">Sua assinatura cadastrada será aplicada a esta OS.</p>
            </div>
          )}
          {minhaAssinatura === null && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-2">Primeira vez: desenhe sua assinatura. Ela fica salva no seu perfil e é aplicada automaticamente nas próximas OS.</p>
              <QuadroAssinatura ref={quadroResponsavel} rotulo="Sua assinatura" altura="h-32" />
            </div>
          )}
        </div>

        {erro && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2" data-testid="concluir-erro">{erro}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button type="button" variant="cta" loading={salvando} onClick={concluir}>Concluir atendimento</Button>
        </div>
      </div>
    </Modal>
  )
}
