import { Label } from '@/components/ui/input'
import { useMotivosPausa, useMotivosCancelamento, type MotivoPausa, type MotivoCancelamento } from '@/hooks/useCatalogoSla'

// Campos de SLA nos modais de mudança de status (migration 044) — usados no
// detalhe da OS (admin) e na OS do app do técnico:
//  * Pausar: motivo da lista da empresa (alguns param o relógio do SLA)
//  * Agendar: "a pedido do cliente" — a data agendada vira o prazo

export function MotivoPausaCampo({ valor, onChange }: { valor: string; onChange: (id: string, nome: string, motivo?: MotivoPausa) => void }) {
  const { motivos } = useMotivosPausa()
  const ativos = motivos.filter(m => m.ativo)
  const escolhido = ativos.find(m => m.id === valor)
  return (
    <div>
      <Label htmlFor="motivo-pausa">Motivo da pausa *</Label>
      <select id="motivo-pausa" value={valor} onChange={e => { const m = ativos.find(x => x.id === e.target.value); onChange(e.target.value, m?.nome ?? '', m) }}
        className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground">
        <option value="">Selecione</option>
        {ativos.map(m => <option key={m.id} value={m.id}>{m.nome}{m.para_sla ? ' (para o relógio do SLA)' : ''}</option>)}
      </select>
      {escolhido && (
        <p className="text-[11px] text-muted-foreground mt-1">
          {escolhido.para_sla ? 'O prazo de SLA fica parado enquanto a OS estiver pausada.' : 'O prazo de SLA continua contando durante a pausa.'}
        </p>
      )}
    </div>
  )
}

export function AgendadoClienteCampo({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border px-3 py-2">
      <input type="checkbox" checked={valor} onChange={e => onChange(e.target.checked)} className="mt-0.5" aria-label="Agendado a pedido do cliente" />
      <span>
        <span className="text-sm text-foreground">Agendado a pedido do cliente</span>
        <span className="block text-[11px] text-muted-foreground">O tempo até a data combinada <b>pausa o SLA</b>; o tempo já gasto é mantido.</span>
      </span>
    </label>
  )
}


// O que o motivo escolhido pede ao pausar (E5b): mensagem pública ao cliente, previsão de retorno e o que o cliente verá
export function PausaClienteCampos({ motivo, portal, mensagem, setMensagem, previsao, setPrevisao }: {
  motivo?: MotivoPausa; portal: boolean; mensagem: string; setMensagem: (v: string) => void; previsao: string; setPrevisao: (v: string) => void
}) {
  if (!motivo) return null
  const campo = 'w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
  return (
    <div className="space-y-3" data-testid="pausa-cliente">
      {motivo.comportamento === 'aciona' && portal && (
        <div>
          <Label htmlFor="pausa-mensagem">Mensagem ao cliente *</Label>
          <textarea id="pausa-mensagem" rows={3} maxLength={2000} value={mensagem} onChange={e => setMensagem(e.target.value)} className={campo} data-testid="pausa-mensagem"
            placeholder="O que você precisa do cliente? Ele lê no portal e, quando responder, a OS volta sozinha para Em andamento." />
        </div>
      )}
      {motivo.exige_previsao && (
        <div>
          <Label htmlFor="pausa-previsao">Previsão de retorno *</Label>
          <input id="pausa-previsao" type="datetime-local" value={previsao} onChange={e => setPrevisao(e.target.value)} className={campo} data-testid="pausa-previsao" />
          <p className="text-[11px] text-muted-foreground mt-1">Vencida a previsão, o responsável e os coordenadores são avisados.</p>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground" data-testid="pausa-o-que-cliente-ve">
        {!portal ? 'Esta OS não veio do portal: não há cliente a avisar.'
          : motivo.comportamento === 'aciona' ? 'O cliente vê "Aguardando sua resposta" com a sua mensagem.'
            : motivo.comportamento === 'comunica' ? `O cliente vê "${motivo.texto_cliente || motivo.nome}"${motivo.exige_previsao ? ' e a previsão de retorno' : ''} e recebe um e-mail.`
              : 'O cliente continua vendo "Em andamento" (pausa interna).'}
      </p>
    </div>
  )
}


// Cancelar a OS: o motivo vem da lista da empresa (cadastrável); "Cliente ausente" e "Sem acesso" contam como visita improdutiva
export function MotivoCancelamentoCampo({ valor, onChange }: { valor: string; onChange: (id: string, nome: string, motivo?: MotivoCancelamento) => void }) {
  const { motivos } = useMotivosCancelamento()
  const ativos = motivos.filter(m => m.ativo)
  const escolhido = ativos.find(m => m.id === valor)
  return (
    <div>
      <Label htmlFor="motivo-cancelamento">Motivo do cancelamento *</Label>
      <select id="motivo-cancelamento" value={valor} onChange={e => { const m = ativos.find(x => x.id === e.target.value); onChange(e.target.value, m?.nome ?? '', m) }}
        className="w-full px-3 py-2.5 rounded-md bg-input border border-border text-sm text-foreground" data-testid="motivo-cancelamento">
        <option value="">Selecione</option>
        {ativos.map(m => <option key={m.id} value={m.id}>{m.nome}{m.improdutiva ? ' (visita improdutiva)' : ''}</option>)}
      </select>
      {escolhido?.improdutiva && <p className="text-[11px] text-muted-foreground mt-1" data-testid="aviso-improdutiva">Conta como visita improdutiva e o cliente poderá pedir uma nova visita pelo portal.</p>}
    </div>
  )
}
