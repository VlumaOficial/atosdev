import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { MapPin, Map as MapIcon } from 'lucide-react'

interface Props {
  open: boolean
  onAceitar: () => void
  onCancelar: () => void
  termoAtualizado?: boolean   // já tinha aceito uma versão anterior do termo
}

export default function LocationConsentModal({ open, onAceitar, onCancelar, termoAtualizado }: Props) {
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onCancelar() }} title={termoAtualizado ? "Aviso de localização atualizado" : "Uso de localização"} description="Necessário para anexar fotos de evidência">
      <div className="space-y-4">
        {termoAtualizado && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            O aviso mudou desde o seu último aceite: agora a foto também leva o endereço, obtido a partir da coordenada. Leia e aceite novamente para continuar.
          </p>
        )}
        <div className="flex items-start gap-3">
          <MapPin size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Para carimbar a localização em cada foto de evidência, o ATOS precisa da sua permissão de GPS. A leitura acontece <strong>só no momento da foto</strong> — não ficamos monitorando sua posição em segundo plano, e não existe histórico de trajeto.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <MapIcon size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Para escrever o <strong>endereço</strong> no carimbo, a coordenada daquele momento é enviada ao serviço de mapas OpenStreetMap. Só a coordenada — nenhum nome, e-mail ou dado da ordem de serviço.
          </p>
        </div>
        <Link to="/privacidade" target="_blank" className="text-xs text-primary hover:underline">
          Ler o aviso de privacidade completo
        </Link>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancelar}>Agora não</Button>
          <Button type="button" variant="cta" onClick={onAceitar}>Aceitar e continuar</Button>
        </div>
      </div>
    </Modal>
  )
}
