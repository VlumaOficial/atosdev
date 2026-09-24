import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'https://esm.sh/pdf-lib@1.17.1'
import qrcode from 'https://esm.sh/qrcode-generator@2.0.4'

// Relatório PDF da OS (F6 Bloco C, layout aprovado em 2026-09-24).
// Chamado pelo BANCO quando a OS é concluída (gatilho + pg_net, com a
// service role) ou pelo app sob demanda (usuário da mesma empresa).
// Gera, guarda em {tenant}/relatorios/{os}_v{n}.pdf e registra código de
// verificação + hash (tabela fotos_verificacao, tipo "relatorio").
// Conteúdo: dados, serviço, linha do tempo, checklist, evidências
// (fotos carimbadas com código), assinaturas. SEM comentários internos.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const SITE = Deno.env.get('SITE_URL') ?? 'https://atosdev.vercel.app'
const BUCKET = 'evidencias'
const A4 = { w: 595.28, h: 841.89 }
const M = 40                       // margem
const COR = {
  texto: rgb(0.11, 0.12, 0.16), fraco: rgb(0.42, 0.45, 0.52), linha: rgb(0.86, 0.87, 0.9),
  faixa: rgb(0.95, 0.95, 0.97), roxo: rgb(0.545, 0.361, 0.965), verde: rgb(0.13, 0.55, 0.3), ambar: rgb(0.7, 0.45, 0.05),
}
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const STATUS: Record<string, string> = { aberta: 'Aberta', agendada: 'Agendada', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' }
const PRIORIDADE: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }
const EVENTO: Record<string, string> = {
  created: 'Aberta', scheduled: 'Agendada', started: 'Iniciada', paused: 'Pausada', resumed: 'Retomada',
  completed: 'Concluída', cancelled: 'Cancelada', reopened: 'Reaberta', transferred: 'Transferida',
  signed: 'Assinada pelo cliente', signature_absent: 'Concluída sem assinatura do cliente',
}

// Fontes padrão do PDF usam WinAnsi: acentos do português ok; o resto vira "?"
const EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
function t(s: unknown): string {
  return String(s ?? '').replace(/\r/g, '').split('').map(ch => {
    const c = ch.charCodeAt(0)
    if (ch === '\n') return ch
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRAS.has(ch)) return ch
    return c === 0x2713 || c === 0x2714 ? 'v' : '?'
  }).join('')
}
const fmt = (iso?: string | null, comAno = true) => iso
  ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', ...(comAno ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' })
  : '—'
const fmtCodigo = (c: string) => c.replace(/(.{4})(?=.)/g, '$1-')
function gerarCodigo(): string {
  const b = crypto.getRandomValues(new Uint8Array(24)); let s = ''
  for (const x of b) { if (x < 248) s += ALFABETO[x % 31]; if (s.length === 12) break }
  return s.length === 12 ? s : gerarCodigo()
}
async function sha256Hex(bytes: Uint8Array) {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function duracao(ini?: string | null, fim?: string | null) {
  if (!ini || !fim) return null
  const min = Math.round((new Date(fim).getTime() - new Date(ini).getTime()) / 60000)
  if (min < 0) return null
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`
}

// ---------------- motor de layout simples ----------------
class Doc {
  pdf!: PDFDocument; reg!: PDFFont; bold!: PDFFont; page!: PDFPage; y = 0
  static async criar() { const d = new Doc(); d.pdf = await PDFDocument.create(); d.reg = await d.pdf.embedFont(StandardFonts.Helvetica); d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold); d.novaPagina(); return d }
  novaPagina() { this.page = this.pdf.addPage([A4.w, A4.h]); this.y = A4.h - M }
  garantir(h: number) { if (this.y - h < M + 28) this.novaPagina() }
  quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
    const linhas: string[] = []
    for (const par of t(texto).split('\n')) {
      let atual = ''
      for (const palavra of par.split(/ +/)) {
        const teste = atual ? atual + ' ' + palavra : palavra
        if (font.widthOfTextAtSize(teste, size) > largura && atual) { linhas.push(atual); atual = palavra } else atual = teste
      }
      linhas.push(atual)
    }
    return linhas
  }
  texto(s: string, o: { x?: number; size?: number; font?: PDFFont; cor?: ReturnType<typeof rgb>; largura?: number; entre?: number } = {}) {
    const size = o.size ?? 9.5, font = o.font ?? this.reg, x = o.x ?? M, largura = o.largura ?? A4.w - M - x
    for (const l of this.quebrar(s, font, size, largura)) {
      this.garantir(size + 3)
      this.page.drawText(l, { x, y: this.y - size, size, font, color: o.cor ?? COR.texto })
      this.y -= size + (o.entre ?? 3)
    }
  }
  // "minimo" = altura do PRIMEIRO bloco que vem logo depois do título (a
  // mesma usada no garantir() desse bloco): título e começo do conteúdo
  // ficam sempre na mesma página
  secao(titulo: string, minimo = 40) {
    this.garantir(minimo + 34); this.y -= 8
    this.page.drawRectangle({ x: M, y: this.y - 18, width: A4.w - 2 * M, height: 18, color: COR.faixa })
    this.page.drawText(t(titulo), { x: M + 8, y: this.y - 13, size: 10, font: this.bold, color: COR.roxo })
    this.y -= 26
  }
  par(rotulo: string, valor: string, x: number, largura: number, yBase: number) {
    this.page.drawText(t(rotulo), { x, y: yBase - 8, size: 7.5, font: this.bold, color: COR.fraco })
    const linhas = this.quebrar(valor || '—', this.reg, 9.5, largura).slice(0, 3)
    linhas.forEach((l, i) => this.page.drawText(l, { x, y: yBase - 20 - i * 12, size: 9.5, font: this.reg, color: COR.texto }))
    return 14 + linhas.length * 12
  }
  qr(texto: string, x: number, y: number, tam: number) {
    const q = qrcode(0, 'M'); q.addData(texto); q.make()
    const n = q.getModuleCount(), m = tam / n
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) this.page.drawRectangle({ x: x + c * m, y: y + tam - (r + 1) * m, width: m + 0.2, height: m + 0.2, color: rgb(0, 0, 0) })
  }
  imagem(img: PDFImage, x: number, maxW: number, maxH: number) {
    const e = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * e, h = img.height * e
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h })
    return h
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE)
  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return json({ erro: 'order_id obrigatório' }, 400)

  const { data: os } = await admin.from('orders')
    .select('*, clients(name), locations(name, address, city, state), technician:users!orders_technician_id_fkey(name), tenants(name, cnpj, phone, email)')
    .eq('id', order_id).single()
  if (!os) return json({ erro: 'OS não encontrada' }, 404)

  // quem chama: o banco (service role) ou usuário da MESMA empresa
  // verify_jwt=true: a plataforma já validou a assinatura do token antes
  // de chegar aqui — então o papel dentro dele é confiável
  const auth = req.headers.get('Authorization') ?? ''
  let papel = ''
  try { papel = JSON.parse(atob(auth.replace(/^Bearer /, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.role ?? '' } catch { /* token opaco */ }
  if (papel !== 'service_role' && auth !== `Bearer ${SERVICE}`) {
    const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ erro: 'Não autenticado' }, 401)
    const { data: perfil } = await admin.from('users').select('tenant_id, role').eq('id', user.id).single()
    if (!perfil || (perfil.role !== 'super_admin' && perfil.tenant_id !== os.tenant_id)) return json({ erro: 'Sem permissão' }, 403)
  }
  if (os.status !== 'concluida') return json({ erro: 'Relatório só é gerado para OS concluída' }, 409)

  // registro da versão: usa o pendente mais recente; se já existe gerado, devolve (idempotente)
  const { data: ultimo } = await admin.from('order_reports').select('*').eq('order_id', order_id).order('versao', { ascending: false }).limit(1).maybeSingle()
  let rel = ultimo
  if (rel?.status === 'gerado') return json({ ok: true, ja_existia: true, file_path: rel.file_path, codigo: rel.codigo })
  if (!rel) {
    const { data: novo } = await admin.from('order_reports').insert({ tenant_id: os.tenant_id, order_id, versao: 1 }).select().single()
    rel = novo
  }
  await admin.from('order_reports').update({ status: 'gerando', tentativas: (rel.tentativas ?? 0) + 1, erro: null }).eq('id', rel.id)

  try {
    const tenant = os.tenant_id as string
    const baixar = async (p?: string | null) => { if (!p) return null; const { data } = await admin.storage.from(BUCKET).download(p); return data ? new Uint8Array(await data.arrayBuffer()) : null }

    const [{ data: eventos }, { data: instancias }, { data: evidencias }] = await Promise.all([
      admin.from('order_events').select('event_type, created_at, actor_name, details').eq('order_id', order_id).order('created_at'),
      admin.from('checklist_instances').select('id, title_snapshot, template_id, status').eq('order_id', order_id),
      admin.from('order_evidences').select('file_path, observacao, created_at').eq('order_id', order_id).order('created_at'),
    ])

    // checklist: itens do modelo + respostas
    const checklists: { titulo: string; status: string; itens: { label: string; resp: string[]; fotos: string[] }[] }[] = []
    const fotosChecklist: { path: string; legenda: string }[] = []
    for (const inst of instancias ?? []) {
      const [{ data: itens }, { data: resps }] = await Promise.all([
        admin.from('checklist_template_items').select('id, label, fields, position').eq('template_id', inst.template_id).order('position'),
        admin.from('checklist_answers').select('item_id, value').eq('instance_id', inst.id),
      ])
      const porItem = new Map((resps ?? []).map((r: any) => [r.item_id, r.value]))
      checklists.push({
        titulo: inst.title_snapshot, status: inst.status,
        itens: (itens ?? []).map((it: any) => {
          const v = porItem.get(it.id) ?? {}
          const resp: string[] = []; const fotos: string[] = []
          for (const f of (Array.isArray(it.fields) ? it.fields : [])) {
            const val = v?.[f.id]
            if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) continue
            if (f.type === 'foto') { fotos.push(String(val)); fotosChecklist.push({ path: String(val), legenda: `Checklist: ${it.label}` }) }
            else if (f.type === 'sim_nao') resp.push(val === true || val === 'sim' ? 'Sim' : val === false || val === 'nao' ? 'Não' : String(val))
            else resp.push(Array.isArray(val) ? val.join(', ') : String(val))
          }
          return { label: it.label, resp, fotos }
        }),
      })
    }

    const todasFotos = [
      ...(evidencias ?? []).map((e: any, i: number) => ({ path: e.file_path as string, legenda: `Evidência ${i + 1} · ${fmt(e.created_at, false)}`, obs: e.observacao as string | null })),
      ...fotosChecklist.map(f => ({ ...f, obs: null as string | null })),
    ]
    const { data: codigos } = todasFotos.length
      ? await admin.from('fotos_verificacao').select('file_path, codigo').in('file_path', todasFotos.map(f => f.path))
      : { data: [] as any[] }
    const codigoDe = new Map((codigos ?? []).map((c: any) => [c.file_path, c.codigo]))

    const codigo = gerarCodigo()
    const urlVerif = `${SITE}/verificar/${codigo}`
    const d = await Doc.criar()
    const tn = os.tenants ?? {}

    // ---------- cabeçalho ----------
    const logoBytes = await baixar(`${tenant}/logo.png`)
    let xTit = M
    if (logoBytes) {
      try { const logo = await d.pdf.embedPng(logoBytes); const e = Math.min(90 / logo.width, 42 / logo.height); d.page.drawImage(logo, { x: M, y: d.y - logo.height * e, width: logo.width * e, height: logo.height * e }); xTit = M + logo.width * e + 12 } catch { /* segue sem logo */ }
    }
    d.page.drawText(t(tn.name ?? ''), { x: xTit, y: d.y - 11, size: 12, font: d.bold, color: COR.texto })
    const contato = [tn.cnpj && `CNPJ ${tn.cnpj}`, tn.phone, tn.email].filter(Boolean).join(' · ')
    if (contato) d.page.drawText(t(contato), { x: xTit, y: d.y - 24, size: 8, font: d.reg, color: COR.fraco })
    d.page.drawText(t(`RELATÓRIO DE ATENDIMENTO · ${os.number}`), { x: xTit, y: d.y - 40, size: 12.5, font: d.bold, color: COR.roxo })
    const tamQr = 58
    d.qr(urlVerif, A4.w - M - tamQr, d.y - tamQr, tamQr)
    d.page.drawText('Documento autenticado', { x: A4.w - M - tamQr - 4 - d.reg.widthOfTextAtSize('Documento autenticado', 7), y: d.y - 20, size: 7, font: d.reg, color: COR.fraco })
    const cod = fmtCodigo(codigo)
    d.page.drawText(cod, { x: A4.w - M - tamQr - 4 - d.bold.widthOfTextAtSize(cod, 8), y: d.y - 31, size: 8, font: d.bold, color: COR.texto })
    d.y -= 70
    d.page.drawLine({ start: { x: M, y: d.y }, end: { x: A4.w - M, y: d.y }, thickness: 0.8, color: COR.linha })

    // ---------- 1. dados ----------
    d.secao('1. DADOS DO ATENDIMENTO')
    const col = (A4.w - 2 * M) / 3
    const endereco = [os.locations?.address, os.locations?.city, os.locations?.state].filter(Boolean).join(', ')
    const linhasDados: [string, string][][] = [
      [['Cliente', os.clients?.name ?? ''], ['Unidade', os.locations?.name ?? ''], ['Situação', STATUS[os.status] ?? os.status]],
      [['Endereço', endereco], ['Técnico', os.technician?.name ?? ''], ['Prioridade', PRIORIDADE[os.priority] ?? os.priority]],
      [['Abertura', fmt(os.created_at)], ['Início', fmt(os.started_at)], ['Conclusão', fmt(os.completed_at) + (duracao(os.started_at, os.completed_at) ? ` (${duracao(os.started_at, os.completed_at)})` : '')]],
    ]
    for (const linha of linhasDados) {
      d.garantir(50)
      const base = d.y
      const alturas = linha.map(([r, v], i) => d.par(r, v, M + i * col, col - 10, base))
      d.y = base - Math.max(...alturas) - 4
    }

    // ---------- 2. serviço ----------
    d.secao('2. SERVIÇO')
    d.texto('Solicitado', { font: d.bold, size: 8, cor: COR.fraco }); d.texto(`${os.title}${os.description ? '\n' + os.description : ''}`)
    d.y -= 4
    d.texto('Realizado', { font: d.bold, size: 8, cor: COR.fraco }); d.texto(os.completion_notes || 'Sem relato informado.')

    // ---------- linha do tempo ----------
    const evs = (eventos ?? []).filter((e: any) => e.event_type !== 'edited')
    if (evs.length) {
      d.secao('LINHA DO TEMPO')
      for (const e of evs as any[]) {
        const det = e.details ?? {}
        const extra = det.reason ? ` — Motivo: ${det.reason}` : det.signer_name ? ` — ${det.signer_name}` : ''
        d.texto(`${fmt(e.created_at)}   ${EVENTO[e.event_type] ?? e.event_type}${e.actor_name ? ' · por ' + e.actor_name : ''}${extra}`, { size: 8.5 })
      }
    }

    // ---------- 3. checklist ----------
    if (checklists.length) {
      d.secao(`3. CHECKLIST`, 60)
      for (const ck of checklists) {
        d.texto(`${ck.titulo}${ck.status === 'concluido' ? ' (concluído)' : ''}`, { font: d.bold, size: 9.5 })
        for (const it of ck.itens) {
          const resp = [...it.resp, ...(it.fotos.length ? ['foto nas evidências'] : [])].join(' · ') || '(sem resposta)'
          d.garantir(26)
          const base = d.y
          const linhasL = d.quebrar(it.label, d.reg, 9, (A4.w - 2 * M) * 0.55)
          linhasL.forEach((l, i) => d.page.drawText(l, { x: M + 6, y: base - 9 - i * 11, size: 9, font: d.reg, color: COR.texto }))
          const linhasR = d.quebrar(resp, d.bold, 9, (A4.w - 2 * M) * 0.4)
          linhasR.forEach((l, i) => d.page.drawText(l, { x: M + (A4.w - 2 * M) * 0.58, y: base - 9 - i * 11, size: 9, font: d.bold, color: COR.texto }))
          d.y = base - Math.max(linhasL.length, linhasR.length) * 11 - 5
          d.page.drawLine({ start: { x: M + 6, y: d.y + 2 }, end: { x: A4.w - M, y: d.y + 2 }, thickness: 0.4, color: COR.linha })
        }
        d.y -= 4
      }
    }

    // ---------- 4. evidências ----------
    if (todasFotos.length) {
      d.secao(`${checklists.length ? '4' : '3'}. EVIDÊNCIAS FOTOGRÁFICAS`, 250)
      const gap = 12, cw = (A4.w - 2 * M - gap) / 2, maxH = 200
      for (let i = 0; i < todasFotos.length; i += 2) {
        const par = todasFotos.slice(i, i + 2)
        const imgs = await Promise.all(par.map(async f => { const b = await baixar(f.path); if (!b) return null; try { return await d.pdf.embedJpg(b) } catch { return null } }))
        const alt = Math.max(...imgs.map(im => im ? Math.min(maxH, im.height * Math.min(cw / im.width, maxH / im.height)) : 30))
        d.garantir(alt + 46)
        const topo = d.y
        let fundo = topo
        par.forEach((f, j) => {
          const x = M + j * (cw + gap)
          d.y = topo
          if (imgs[j]) d.imagem(imgs[j]!, x, cw, maxH)
          else d.page.drawText('(foto indisponível)', { x, y: topo - 12, size: 8, font: d.reg, color: COR.fraco })
          let y = topo - alt - 11
          d.page.drawText(t(f.legenda).slice(0, 70), { x, y, size: 7.5, font: d.bold, color: COR.texto })
          if (f.obs) { for (const l of d.quebrar(f.obs, d.reg, 7.5, cw).slice(0, 2)) { y -= 10; d.page.drawText(l, { x, y, size: 7.5, font: d.reg, color: COR.texto }) } }
          const c = codigoDe.get(f.path)
          if (c) { y -= 10; d.page.drawText(`Cód. de verificação ${fmtCodigo(c)}`, { x, y, size: 7, font: d.reg, color: COR.fraco }) }
          fundo = Math.min(fundo, y)
        })
        d.y = fundo - 12
      }
    }

    // ---------- 5. assinaturas ----------
    const ALTURA_ASSINATURAS = 125
    d.secao(`${todasFotos.length ? (checklists.length ? '5' : '4') : (checklists.length ? '4' : '3')}. ASSINATURAS`, ALTURA_ASSINATURAS)
    d.garantir(ALTURA_ASSINATURAS)
    const topoAss = d.y, cwA = (A4.w - 2 * M - 20) / 2
    const blocoAss = async (x: number, titulo: string, path: string | null, nome: string | null, quando: string | null) => {
      d.y = topoAss
      d.page.drawText(t(titulo), { x, y: d.y - 8, size: 7.5, font: d.bold, color: COR.fraco })
      d.y -= 14
      const b = await baixar(path)
      if (b) { try { const img = await d.pdf.embedPng(b); d.y -= d.imagem(img, x, cwA, 70) } catch { /* ignora */ } }
      d.page.drawLine({ start: { x, y: d.y - 2 }, end: { x: x + cwA * 0.85, y: d.y - 2 }, thickness: 0.6, color: COR.fraco })
      d.page.drawText(t(`${nome ?? ''}${quando ? ' · ' + fmt(quando) : ''}`), { x, y: d.y - 13, size: 8.5, font: d.reg, color: COR.texto })
      return d.y - 16
    }
    let fimAss = topoAss
    if (os.signature_path) fimAss = Math.min(fimAss, await blocoAss(M, 'CLIENTE', os.signature_path, os.signer_name, os.signed_at))
    else if (os.signature_absent_reason) {
      d.page.drawRectangle({ x: M, y: topoAss - 64, width: cwA, height: 60, color: rgb(1, 0.97, 0.9), borderColor: COR.ambar, borderWidth: 0.8 })
      d.page.drawText('CLIENTE NÃO ASSINOU', { x: M + 8, y: topoAss - 18, size: 8.5, font: d.bold, color: COR.ambar })
      d.quebrar(`Motivo: ${os.signature_absent_reason}`, d.reg, 8, cwA - 16).slice(0, 3).forEach((l, i) => d.page.drawText(l, { x: M + 8, y: topoAss - 32 - i * 10, size: 8, font: d.reg, color: COR.texto }))
      fimAss = Math.min(fimAss, topoAss - 70)
    } else {
      d.page.drawText('Cliente: sem assinatura registrada.', { x: M, y: topoAss - 10, size: 8.5, font: d.reg, color: COR.fraco }); fimAss = Math.min(fimAss, topoAss - 20)
    }
    if (os.technician_signature_path) fimAss = Math.min(fimAss, await blocoAss(M + cwA + 20, 'RESPONSÁVEL', os.technician_signature_path, os.technician_signer_name, os.technician_signed_at))
    d.y = fimAss

    // ---------- rodapé em todas as páginas ----------
    const paginas = d.pdf.getPages()
    const agora = fmt(new Date().toISOString())
    paginas.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M + 14 }, end: { x: A4.w - M, y: M + 14 }, thickness: 0.5, color: COR.linha })
      p.drawText(t(`Gerado pelo ATOS em ${agora} · Confira a autenticidade em ${urlVerif.replace(/^https?:\/\//, '')}`), { x: M, y: M + 3, size: 7, font: d.reg, color: COR.fraco })
      const pg = `Página ${i + 1} de ${paginas.length}`
      p.drawText(t(pg), { x: A4.w - M - d.reg.widthOfTextAtSize(t(pg), 7), y: M + 3, size: 7, font: d.reg, color: COR.fraco })
    })
    d.pdf.setTitle(t(`Relatório de Atendimento ${os.number}`)); d.pdf.setAuthor(t(tn.name ?? 'ATOS')); d.pdf.setCreator('ATOS - Gestão de Campo')

    const bytes = await d.pdf.save()
    const caminho = `${tenant}/relatorios/${order_id}_v${rel.versao}.pdf`
    const { error: eUp } = await admin.storage.from(BUCKET).upload(caminho, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true })
    if (eUp) throw new Error('upload: ' + eUp.message)
    const hash = await sha256Hex(bytes)
    const { error: eVer } = await admin.from('fotos_verificacao').insert({ codigo, tenant_id: tenant, file_path: caminho, sha256: hash, bytes: bytes.length, order_id, tipo: 'relatorio', carimbado_em: new Date().toISOString() })
    if (eVer) throw new Error('verificacao: ' + eVer.message)
    await admin.from('order_reports').update({ status: 'gerado', file_path: caminho, sha256: hash, bytes: bytes.length, codigo, gerado_em: new Date().toISOString() }).eq('id', rel.id)
    return json({ ok: true, file_path: caminho, codigo, bytes: bytes.length, paginas: paginas.length })
  } catch (e) {
    await admin.from('order_reports').update({ status: 'falha', erro: String((e as Error)?.message ?? e).slice(0, 300) }).eq('id', rel.id)
    return json({ ok: false, erro: String((e as Error)?.message ?? e) }, 500)
  }
})
