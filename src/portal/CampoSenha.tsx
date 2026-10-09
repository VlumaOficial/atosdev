import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Campo de senha do portal com o botão "mostrar/ocultar" (todos os campos de senha usam este)
export default function CampoSenha({ id, value, onChange, autoComplete = 'new-password', className, required }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete?: string; className: string; required?: boolean
}) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={ver ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={e => onChange(e.target.value)} className={className + ' pr-10'} required={required} />
      <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} data-testid={'ver-' + id}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </div>
  )
}
