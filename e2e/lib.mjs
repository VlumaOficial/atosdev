import fs from 'fs'
import { execSync } from 'child_process'
export const N = (process.env.ATOS_SCRATCH || '/tmp/atos-scratch')
export const U = 'https://atosdev.vluma.com.br'
export const cred = JSON.parse(fs.readFileSync(N + '/.cred.json'))
export const anon = fs.readFileSync(N + '/.anon', 'utf8').trim()
export const SB = 'https://vgkiddqahubznlzkxfgb.supabase.co'
export const T = '30752cf0-fbfa-419b-afe4-75e06d6992f5'
export const sql = q => JSON.parse(execSync(`${N}/sql.sh -c ${JSON.stringify(q)}`).toString())
let falhas = 0
export const ok = (c, m) => { if (!c) falhas++; console.log((c ? 'OK  ' : 'FALHA ') + m) }
export const resumo = () => { console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK'); return falhas }
export async function entrar(page, c) {
  await page.goto(U + '/login'); await page.waitForSelector('#email', { timeout: 20000 })
  await page.fill('#email', c[0]); await page.fill('#password', c[1]); await page.click('button[type=submit]')
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }); await page.waitForTimeout(2500)
}
export async function token(c) {
  const r = await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c[0], password: c[1] }) })
  return (await r.json()).access_token
}
export async function rest(tok, path, method = 'GET', body) {
  const r = await fetch(SB + '/rest/v1/' + path, { method, headers: { apikey: anon, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); try { return JSON.parse(t) } catch { return t }
}
