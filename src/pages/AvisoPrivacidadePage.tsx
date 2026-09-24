import { Link } from 'react-router-dom'
import AtosLogo from '@/components/brand/AtosLogo'
import AtribuicaoMapas from '@/components/AtribuicaoMapas'
import { MapPin, Camera, Lock, Building2, Map as MapIcon, ShieldCheck } from 'lucide-react'

export default function AvisoPrivacidadePage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-xl mx-auto">
        <Link to="/" className="inline-block mb-8"><AtosLogo size={32} /></Link>

        <h1 className="text-xl font-semibold text-foreground mb-1">Aviso de Privacidade — Localização</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Este aviso explica como o ATOS usa a localização (GPS) do dispositivo ao registrar evidências fotográficas em campo.
        </p>

        <div className="space-y-5">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Camera size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">GPS só no momento da foto</p>
              <p className="text-sm text-muted-foreground mt-0.5">A localização é lida uma única vez, sob demanda, apenas quando você anexa uma foto de evidência. O sistema nunca monitora sua posição continuamente e não existe histórico de trajeto.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <MapPin size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">A coordenada pertence à foto, não a você</p>
              <p className="text-sm text-muted-foreground mt-0.5">As coordenadas ficam carimbadas apenas na imagem da evidência — nunca são guardadas separadamente como "posição do técnico".</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <MapIcon size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Conversão da coordenada em endereço</p>
              <p className="text-sm text-muted-foreground mt-0.5">Para escrever o endereço no carimbo da foto, a coordenada daquele momento passa pelo servidor do ATOS e é consultada num provedor de mapas contratado pela plataforma (dados do OpenStreetMap; provedores possíveis: Nominatim/OpenStreetMap Foundation, LocationIQ ou OpenCage — o atual aparece no rodapé do app). Só a coordenada é enviada — nenhum nome, e-mail ou dado da ordem de serviço. O resultado pode ficar guardado por até 48 horas para reaproveitar em fotos do mesmo local. Se o serviço não responder, a foto sai apenas com as coordenadas.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Código de verificação da foto</p>
              <p className="text-sm text-muted-foreground mt-0.5">Cada foto de evidência recebe um código único e um QR Code impressos no selo "Foto autenticada". Quem tiver o código pode conferir, em /verificar, se a foto é autêntica — vendo a própria foto, a empresa, o número da OS e os horários. Nome, e-mail ou outros dados do técnico não são exibidos.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Lock size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Você decide, a qualquer momento</p>
              <p className="text-sm text-muted-foreground mt-0.5">Sem aceitar o uso de localização, não é possível anexar fotos de evidência — mas essa é a única funcionalidade afetada. Você pode reler este aviso sempre que quiser.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Quem é responsável pelos dados</p>
              <p className="text-sm text-muted-foreground mt-0.5">A VLUMA opera a plataforma; a empresa que emprega o técnico é a controladora dos dados inseridos, responsável pelo uso conforme a legislação de proteção de dados (LGPD).</p>
            </div>
          </div>
        </div>
        <AtribuicaoMapas className="mt-8" />
      </div>
    </div>
  )
}
