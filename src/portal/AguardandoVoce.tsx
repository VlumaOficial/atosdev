import { Hourglass } from 'lucide-react'

// Selo "Aguardando você": a empresa pausou o chamado e depende de uma resposta do cliente (E5b)
export default function AguardandoVoce({ className = '' }: { className?: string }) {
  return <span data-testid="aguardando-voce" className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-amber-500/40 bg-amber-500/10 text-amber-300 ' + className}><Hourglass size={11} /> Aguardando você</span>
}
