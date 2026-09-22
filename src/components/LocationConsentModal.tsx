import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { MapPin } from 'lucide-react'

interface Props {
  open: boolean
  onAceitar: () => void
  onCancelar: () => void
}

export default function LocationConsentModal({ open, onAceitar, onCancelar }: Props) {
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onCancelar() }} title="Uso de localização" description="Necessário para anexar fotos de evidência">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <MapPin size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Para carimbar a localização em cada foto de evidência, o ATOS precisa da sua permissão de GPS. A leitura acontece <strong>só no momento da foto</strong> — não ficamos monitorando sua posição em segundo plano, e não existe histórico de trajeto.
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
