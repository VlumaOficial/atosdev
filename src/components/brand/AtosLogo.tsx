interface AtosLogoProps {
  size?: number
  showText?: boolean
}

export default function AtosLogo({ size = 36, showText = true }: AtosLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo-atos.png"
        alt="ATOS"
        width={size}
        height={size}
        className="rounded-xl flex-shrink-0"
      />
      {showText && (
        <div>
          <p className="text-sm font-bold vluma-gradient-text leading-none">ATOS</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">Gestão de Campo</p>
        </div>
      )}
    </div>
  )
}
