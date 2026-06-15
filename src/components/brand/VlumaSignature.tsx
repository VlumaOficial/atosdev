interface VlumaSignatureProps {
  className?: string
}

export default function VlumaSignature({ className = '' }: VlumaSignatureProps) {
  return (
    
      href="https://vluma.com.br"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <span>Desenvolvido por</span>
      <img src="/logovluma.png" alt="VLUMA" className="w-4 h-4 rounded-full" />
      <span className="font-semibold text-green-400">VLUMA</span>
    </a>
  )
}
