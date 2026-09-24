import type { Tenant } from '@/types'

// Nome que a empresa escolheu para aparecer (nome de exibição/fantasia);
// sem ele, a razão social cadastrada pelo Super Admin
export function nomeEmpresa(tenant?: Pick<Tenant, 'name' | 'trade_name'> | null): string {
  return (tenant?.trade_name?.trim() || tenant?.name || '').trim()
}

// CNPJ: 14 dígitos + dígitos verificadores (mesma regra da função cnpj_valido no banco)
export function cnpjValido(v: string): boolean {
  const d = v.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string, pesos: number[]) => { const r = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0) % 11; return r < 2 ? 0 : 11 - r }
  const d1 = dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === Number(d[12]) && d2 === Number(d[13])
}

export function mascaraCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
