import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { consultarVerificacao, type ResultadoVerificacao } from '@/lib/verificacao'
import AtosLogo from '@/components/brand/AtosLogo'
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Search, Upload, Clock } from 'lucide-react'

// Página PÚBLICA (sem login) de verificação de autenticidade de foto.
// Quem recebe uma foto com o selo "ATOS Verificado · CÓDIGO" confere aqui.
// Dados vêm da Edge Function verificar-foto (mínimo necessário, LGPD).

type Resultado = ResultadoVerificacao

const TOLERANCIA_RELOGIO_MIN = 10

function normalizar(c: string) {
  return c.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
function formatar(c: string) {
  return c.replace(/(.{4})(?=.)/g, '$1-')
}
function dataHora(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
}
async function sha256Hex(file: File) {
  const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function VerificarFotoPage() {
  const { codigo: codigoUrl } = useParams()
  const navigate = useNavigate()
  const [entrada, setEntrada] = useState(codigoUrl ? formatar(normalizar(codigoUrl)) : '')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [copia, setCopia] = useState<'igual' | 'diferente' | null>(null)

  useEffect(() => {
    setCopia(null)
    if (!codigoUrl) { setResultado(null); return }
    let ativo = true
    setCarregando(true)
    consultarVerificacao(normalizar(codigoUrl))
      .then(d => { if (ativo) setResultado(d) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [codigoUrl])

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    const c = normalizar(entrada)
    if (c) navigate(`/verificar/${c}`)
  }

  async function conferirCopia(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !resultado?.sha256) return
    setCopia((await sha256Hex(f)) === resultado.sha256 ? 'igual' : 'diferente')
  }

  const r = resultado
  const relogioDivergente = r?.divergencia_relogio_min != null && Math.abs(r.divergencia_relogio_min) > TOLERANCIA_RELOGIO_MIN

  let status: { icone: React.ReactNode; titulo: string; texto: string; cor: string } | null = null
  if (r && !carregando) {
    if (!r.encontrado) {
      status = { icone: <ShieldQuestion size={28} />, cor: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
        titulo: 'Código não encontrado', texto: r.motivo === 'formato' ? 'O código tem 12 caracteres (letras e números), por exemplo K7P2-9XQ4-M3TD.' : 'Confira se o código foi digitado exatamente como aparece na foto.' }
    } else if (!r.arquivo_disponivel) {
      status = { icone: <ShieldQuestion size={28} />, cor: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
        titulo: 'Código válido — foto não está mais armazenada', texto: 'O registro existe, mas a empresa removeu o arquivo do sistema. Ainda é possível conferir uma cópia abaixo.' }
    } else if (r.integra) {
      status = { icone: <ShieldCheck size={28} />, cor: 'text-green-300 border-green-500/30 bg-green-500/10',
        titulo: 'Foto autêntica', texto: 'O arquivo guardado é idêntico ao enviado — não foi alterado desde o envio.' }
    } else {
      status = { icone: <ShieldAlert size={28} />, cor: 'text-red-300 border-red-500/30 bg-red-500/10',
        titulo: 'Foto alterada', texto: 'O arquivo guardado não corresponde ao registrado no envio.' }
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-xl mx-auto">
        <Link to="/" className="inline-block mb-6"><AtosLogo size={30} /></Link>
        <h1 className="text-xl font-semibold text-foreground">Verificar foto</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          Digite o código impresso no selo <strong className="text-foreground">ATOS Verificado</strong> da foto de evidência.
        </p>

        <form onSubmit={buscar} className="flex gap-2">
          <input value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="K7P2-9XQ4-M3TD" aria-label="Código de verificação"
            className="flex-1 px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-ring" />
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Search size={15} /> Verificar
          </button>
        </form>

        {carregando && <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Verificando...</div>}

        {status && (
          <div className={'mt-6 rounded-lg border p-4 flex gap-3 ' + status.cor} data-testid="verificacao-status">
            <div className="flex-shrink-0">{status.icone}</div>
            <div>
              <p className="font-semibold">{status.titulo}</p>
              <p className="text-sm opacity-90 mt-0.5">{status.texto}</p>
            </div>
          </div>
        )}

        {r?.encontrado && !carregando && (
          <div className="mt-4 space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <span className="text-muted-foreground">Código</span><span className="font-mono text-foreground">{formatar(r.codigo ?? '')}</span>
              <span className="text-muted-foreground">Empresa</span><span className="text-foreground">{r.empresa ?? '—'}</span>
              {r.os && <><span className="text-muted-foreground">Ordem de serviço</span><span className="text-foreground">{r.os}</span></>}
              <span className="text-muted-foreground">Hora na foto</span><span className="text-foreground">{dataHora(r.carimbado_em)} <span className="text-muted-foreground text-xs">(relógio do aparelho)</span></span>
              <span className="text-muted-foreground">Recebida em</span><span className="text-foreground">{dataHora(r.enviado_em)} <span className="text-muted-foreground text-xs">(relógio do servidor)</span></span>
            </div>

            {relogioDivergente && (
              <div className="flex gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                <Clock size={14} className="flex-shrink-0 mt-px" />
                <span>A hora impressa na foto difere {Math.abs(r.divergencia_relogio_min!)} min da hora em que o servidor recebeu o arquivo — o relógio do aparelho pode estar ajustado errado. Considere a hora do servidor.</span>
              </div>
            )}

            {r.url_foto && <img src={r.url_foto} alt="Foto verificada" className="w-full rounded-lg border border-border" />}

            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm font-medium text-foreground">Tem uma cópia desta foto?</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">Envie o arquivo que você recebeu para conferir se é idêntico ao original. A conferência acontece no seu navegador — o arquivo não é enviado a lugar nenhum.</p>
              <input type="file" accept="image/*" onChange={conferirCopia} className="hidden" id="copia" />
              <label htmlFor="copia" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-secondary cursor-pointer">
                <Upload size={14} /> Conferir arquivo
              </label>
              {copia === 'igual' && <p className="mt-2 text-sm text-green-300" data-testid="copia-resultado">✓ Idêntica à original.</p>}
              {copia === 'diferente' && <p className="mt-2 text-sm text-red-300" data-testid="copia-resultado">✗ Diferente da original — o arquivo foi alterado, recomprimido ou não é esta foto. (Apps de mensagem costumam recomprimir imagens; nesse caso compare visualmente com a foto acima.)</p>}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              O ATOS garante que a foto não foi alterada depois de enviada e registra quando o servidor a recebeu. A localização impressa vem do GPS do aparelho no momento da foto.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
