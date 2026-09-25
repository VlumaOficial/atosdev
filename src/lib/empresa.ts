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

// CPF: 11 dígitos + dígitos verificadores (mesma regra de cpf_valido no banco, migration 036)
export function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => { const s = [...d.slice(0, n)].reduce((t, c, i) => t + Number(c) * (n + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

// "CPF ou CNPJ" do cliente (pessoa física ou jurídica). Vazio = válido (opcional)
export function erroDocumento(v: string): string | null {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  if (d.length === 11) return cpfValido(d) ? null : 'CPF inválido — confira os números.'
  if (d.length === 14) return cnpjValido(d) ? null : 'CNPJ inválido — confira os números.'
  return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'
}

export function mascaraDocumento(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2')
  return mascaraCnpj(d)
}
