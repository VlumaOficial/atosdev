// Campos configuráveis do carimbo das fotos de evidência (por tenant,
// em tenants.stamp_config — migration 023). O banco guarda só o que
// difere do padrão; o padrão é o modelo aprovado pelo usuário em
// 2026-09-23. A marca/selo ATOS não entra aqui: é fixa (white-label só na F8).

export type CampoCarimbo =
  | 'logo' | 'nome_empresa' | 'hora' | 'data' | 'dia_semana'
  | 'endereco' | 'coordenadas' | 'numero_os' | 'tecnico' | 'unidade'

export type ConfigCarimbo = Record<CampoCarimbo, boolean>

export const CAMPOS_CARIMBO: { campo: CampoCarimbo; rotulo: string; descricao?: string; padrao: boolean }[] = [
  { campo: 'logo', rotulo: 'Logo da empresa', padrao: true },
  { campo: 'nome_empresa', rotulo: 'Nome da empresa', descricao: 'Aparece sempre que não houver logo cadastrada', padrao: false },
  { campo: 'hora', rotulo: 'Hora', padrao: true },
  { campo: 'data', rotulo: 'Data', padrao: true },
  { campo: 'dia_semana', rotulo: 'Dia da semana', padrao: true },
  { campo: 'endereco', rotulo: 'Endereço', descricao: 'Desligado, a coordenada não é enviada ao serviço de mapas', padrao: true },
  { campo: 'coordenadas', rotulo: 'Coordenadas GPS', descricao: 'A prova exata do local — recomendado manter', padrao: true },
  { campo: 'numero_os', rotulo: 'Número da OS', padrao: false },
  { campo: 'unidade', rotulo: 'Unidade atendida', padrao: false },
  { campo: 'tecnico', rotulo: 'Técnico que tirou a foto', padrao: false },
]

export const CONFIG_PADRAO: ConfigCarimbo = Object.fromEntries(
  CAMPOS_CARIMBO.map(c => [c.campo, c.padrao])
) as ConfigCarimbo

export function resolverConfigCarimbo(salvo: Record<string, unknown> | null | undefined): ConfigCarimbo {
  const config = { ...CONFIG_PADRAO }
  for (const c of CAMPOS_CARIMBO) {
    const v = salvo?.[c.campo]
    if (typeof v === 'boolean') config[c.campo] = v
  }
  return config
}

// Só as diferenças em relação ao padrão (o que vai pro banco)
export function diferencasDoPadrao(config: ConfigCarimbo): Partial<ConfigCarimbo> {
  const dif: Partial<ConfigCarimbo> = {}
  for (const c of CAMPOS_CARIMBO) {
    if (config[c.campo] !== c.padrao) dif[c.campo] = config[c.campo]
  }
  return dif
}
