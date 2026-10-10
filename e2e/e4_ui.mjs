import { chromium, devices } from 'playwright'
import fs from 'fs'
import { N, T, SB, anon, cred, sql, ok, resumo, token } from './lib.mjs'
const PH = 'https://atendimento.infoxtec.dev.vluma.com.br'
const CLI = sql(`select id from clients where name='Cliente Trigger Teste'`)[0].id
const admTok = await token(cred.admin)
const chamarAcesso = async (tok, body) => (await fetch(SB + '/functions/v1/portal-acesso', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + (tok ?? anon), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
const linkTeste = () => sql(`select detalhe->>'link_teste' l from portal_auditoria where detalhe->>'link_teste' is not null order by id desc limit 1`)[0]?.l
const SENHA = 'Senha-E4ui-123'
// ---- limpeza e massa
sql(`delete from orders where title like 'E4UI %'; delete from auth.users where email like 'e4ui.%'; delete from portal_pessoas where email like 'e4ui.%'; delete from portal_convites where email like 'e4ui.%'; delete from portal_equipes where nome like 'E4UI %'; delete from os_categorias where nome like 'E4UI %'`)
sql(`update tenants set portal_abertura='{}' where id='${T}'`)
sql(`update clients set portal_ativo = true where name='Cliente Trigger Teste'`)
const gN1 = sql(`select id from grupos_atendimento where nome='Central N1'`)[0].id
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal, descricao_portal, grupo_padrao_id, impacto, urgencia) values ('${T}','E4UI CFTV', true, '{incidente,requisicao,visita,preventiva}', 'Câmeras, gravação e acesso remoto', '${gN1}', 'medio', 'media')`)
const pai = sql(`select id from os_categorias where nome='E4UI CFTV'`)[0].id
sql(`insert into os_categorias (tenant_id, nome, pai_id, visivel_portal, tipos_portal) values ('${T}','E4UI Camera sem imagem','${pai}', true, '{incidente}')`)
sql(`insert into os_categorias (tenant_id, nome, visivel_portal, tipos_portal) values ('${T}','E4UI Oculta', null, '{}')`)
async function criar(nome, email, aceitar = true, equipeId = null) {
  await chamarAcesso(admTok, { acao: 'convidar', client_id: CLI, email, nome, perfil: 'usuario', equipes: equipeId ? [equipeId] : [] })
  const tk = linkTeste().split('/convite/')[1]
  await chamarAcesso(null, { acao: 'aceitar', token: tk, nome, senha: SENHA })
  const uid = sql(`select user_id from portal_pessoas where email='${email}'`)[0].user_id
  if (aceitar) sql(`insert into termos_aceites (user_id, tenant_id, termo_id, canal) select '${uid}','${T}', x.id, 'portal' from portal_termos_vigentes('${T}') x`)
  return uid
}
sql(`insert into portal_equipes (tenant_id, client_id, nome) values ('${T}','${CLI}','E4UI Loja Centro')`)
const EQ = sql(`select id from portal_equipes where nome='E4UI Loja Centro'`)[0].id
const ana = await criar('E4UI Ana', 'e4ui.ana@example.com', true, EQ)
const bia = await criar('E4UI Bia', 'e4ui.bia@example.com', true, EQ)
const dani = await criar('E4UI Dani', 'e4ui.dani@example.com', true)
await criar('E4UI Caio', 'e4ui.caio@example.com', false)
sql(`insert into portal_equipe_membros (equipe_id, user_id, tenant_id) values ('${EQ}','${ana}','${T}'),('${EQ}','${bia}','${T}') on conflict do nothing`)

const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); const erros = []
const nova = async (opts = { viewport: { width: 1280, height: 900 }, permissions: ['microphone'] }) => { const p = await (await b.newContext({ permissions: ['microphone'], ...opts })).newPage(); p.on('pageerror', e => erros.push(e.message)); p.on('response', r => { if (r.status() >= 500) erros.push(r.status() + ' ' + r.url().slice(0, 100)) }); return p }
async function entrar(p, email) {
  await p.goto(PH + '/entrar'); await p.fill('#portal-email', email); await p.fill('#portal-senha', SENHA); await p.click('[data-testid=portal-entrar] button[type=submit]'); await p.waitForTimeout(4500)
}

// ===== sem aceitar os termos: não abre chamado
const caio = await nova(); await entrar(caio, 'e4ui.caio@example.com')
ok(await caio.locator('[data-testid=portal-aceite]').count() === 1, 'pessoa que ainda não aceitou os termos cai na tela de aceite')
await caio.goto(PH + '/abrir'); await caio.waitForTimeout(3000)
ok(await caio.locator('[data-testid=portal-aceite]').count() === 1 && await caio.locator('[data-testid=portal-abrir]').count() === 0, '...e /abrir pela barra de endereço volta ao aceite (a tela de abrir chamado não abre)')

// ===== Ana abre um incidente (computador)
const a = await nova(); await entrar(a, 'e4ui.ana@example.com')
ok(await a.getByTestId('resumo-chamados').count() === 1 && await a.getByTestId('inicio-abrir').count() === 1, 'início: botão "Abrir chamado" e contadores')
ok((await a.getByTestId('portal-nav').innerText()).includes('Chamados') && (await a.getByTestId('portal-nav').innerText()).includes('Preferências') && !(await a.getByTestId('portal-nav').innerText()).includes('Usuários'), 'menu do portal: Início, Chamados, Preferências (sem "Usuários" para quem não é Supervisor)')
await a.getByTestId('inicio-abrir').click(); await a.waitForSelector('[data-testid=portal-abrir]'); await a.waitForSelector('[data-tipo]')
const tipos = await a.locator('[data-tipo]').allInnerTexts()
ok(tipos.length === 4 && tipos.join('|').includes('Relatar um problema') && tipos.join('|').includes('Agendar manutenção preventiva'), 'os 4 tipos em cartões, na linguagem do cliente')
ok(await a.locator('#ab-assunto').count() === 0, 'antes de escolher o tipo, o resto do formulário não aparece')
await a.locator('[data-tipo=incidente]').click()
const assuntos = await a.locator('#ab-assunto option').allInnerTexts()
ok(assuntos.some(x => x.includes('E4UI CFTV › E4UI Camera sem imagem')) && !assuntos.some(x => x.includes('Oculta')), 'assunto: só categorias visíveis no portal, em "pai › filha"')
await a.selectOption('#ab-assunto', { label: 'E4UI CFTV' })
ok((await a.getByTestId('descricao-assunto').innerText()).includes('Câmeras, gravação'), 'descrição do assunto aparece para o cliente')
await a.selectOption('#ab-unidade', { index: 1 })
await a.fill('#ab-titulo', 'E4UI Câmera da entrada sem imagem'); await a.fill('#ab-desc', 'A câmera da entrada parou de gravar desde ontem à noite.')
await a.getByTestId('enviar-chamado').click(); await a.waitForTimeout(600)
ok(await a.getByTestId('erro-abrir').innerText().then(t => t.includes('duas perguntas')), 'sem responder as perguntas de prioridade → aviso claro')
await a.locator('[data-impacto=alto]').click(); await a.locator('[data-urgencia=alta]').click()
ok((await a.getByTestId('prioridade-calculada').innerText()).includes('Crítico'), 'prioridade em linguagem simples: "A empresa toda" + "Parou tudo" → Crítico')
await a.getByTestId('input-galeria').setInputFiles([N + '/foto1.png', N + '/foto2.png']); await a.waitForTimeout(1500)
ok(await a.locator('[data-anexo-local=foto]').count() === 2, '2 fotos anexadas (reduzidas no navegador)')
await a.getByTestId('gravar-audio').click(); await a.waitForTimeout(2500); await a.getByTestId('parar-audio').click(); await a.waitForTimeout(1000)
ok(await a.locator('[data-anexo-local=audio]').count() === 1, 'áudio gravado no navegador e anexado')
ok(await a.getByTestId('compartilhar').isChecked(), '"Compartilhar com a minha equipe" vem marcado')
await a.getByTestId('enviar-chamado').click(); await a.waitForSelector('[data-testid=chamado-registrado]', { timeout: 30000 })
const numero = await a.getByTestId('numero-novo').innerText()
ok(/^OS-\d+/.test(numero), 'chamado registrado: ' + numero)
ok(await a.getByTestId('wa-novo').count() === 1 && (await a.getByTestId('wa-novo').getAttribute('href')).includes('wa.me/'), 'botão "Falar pelo WhatsApp" na confirmação')
const o = sql(`select o.id, o.origem, o.priority, o.prioridade_informada, o.status, o.technician_id, o.equipe_id, o.compartilhado_equipe, g.nome grupo, (select count(*)::int from os_anexos_cliente a where a.order_id=o.id) anexos, (select count(*)::int from os_anexos_cliente a where a.order_id=o.id and a.tipo='audio') audios from orders o left join grupos_atendimento g on g.id=o.grupo_id where o.number='${numero}'`)[0]
ok(o.origem === 'portal' && o.priority === 'critico' && o.prioridade_informada === 'critico' && o.status === 'aberta' && o.technician_id === null, 'a OS nasce com origem portal, crítica, aberta e sem técnico')
ok(o.grupo === 'Central N1' && o.equipe_id === EQ && o.compartilhado_equipe && o.anexos === 3 && o.audios === 1, 'cai no grupo do catálogo (Central N1), na equipe da pessoa, com 3 anexos (2 fotos + 1 áudio)')
ok(sql(`select count(*)::int n from storage.objects where bucket_id='portal-anexos' and name like '%/${ana}/%'`)[0].n === 3, 'os 3 arquivos estão no armazenamento privado, na pasta da própria pessoa')

// ===== Bia (mesma equipe) acompanha
const bi = await nova(); await entrar(bi, 'e4ui.bia@example.com')
await bi.goto(PH + '/chamados'); await bi.waitForSelector('[data-testid=portal-chamados]')
await bi.waitForSelector(`[data-chamado="${numero}"]`, { timeout: 15000 })
ok(await bi.locator(`[data-chamado="${numero}"]`).count() === 1, 'colega da mesma equipe vê o chamado na lista')
ok((await bi.locator(`[data-chamado="${numero}"]`).innerText()).includes('E4UI Ana'), '...com o nome de quem abriu')
await bi.locator(`[data-chamado="${numero}"]`).click(); await bi.waitForSelector('[data-testid=portal-chamado]')
await bi.waitForTimeout(2500)
ok(await bi.locator('[data-etapa=recebido][data-feito=true]').count() === 1 && await bi.locator('[data-etapa=em_atendimento][data-feito=false]').count() === 1, 'detalhe: etapa "Recebido" cumprida e as próximas pendentes')
ok(await bi.locator('[data-anexo]').count() === 3, 'detalhe: fotos e áudio do chamado aparecem')
const imgOk = await bi.locator('[data-testid=anexos-cliente] img').first().evaluate(i => i.complete && i.naturalWidth > 0)
ok(imgOk, 'a foto carrega pelo endereço assinado (armazenamento privado)')
ok(await bi.locator('audio').count() === 1, 'o áudio tem player')
ok(!(await bi.locator('body').innerText()).match(/@|Central N1|nota interna/i), 'nada do lado interno vaza (grupo, notas, e-mails)')
sql(`update orders set status='em_andamento', technician_id=(select id from users where name='Infoxtec Teste' and role='tecnico') where number='${numero}'`)
await bi.reload(); await bi.waitForSelector('[data-testid=portal-chamado]'); await bi.waitForTimeout(2000)
ok(await bi.locator('[data-status=em_atendimento]').count() >= 1 && (await bi.getByTestId('tecnico').innerText()).includes('Infoxtec Teste'), 'situação "Em atendimento" e o nome do técnico (só o nome)')
sql(`update orders set status='agendada', scheduled_at = now() + interval '2 days' where number='${numero}'`)
await bi.reload(); await bi.waitForSelector('[data-testid=portal-chamado]'); await bi.waitForTimeout(2000)
ok(await bi.getByTestId('agendado-para').count() === 1, 'situação "Agendado" mostra a data do atendimento')
sql(`update orders set status='aberta', technician_id=null where number='${numero}'`)

// ===== Dani (fora da equipe): duplicado + "também me afeta"
const d = await nova(); await entrar(d, 'e4ui.dani@example.com')
await d.goto(PH + '/chamados'); await d.waitForSelector('[data-testid=portal-chamados]'); await d.waitForTimeout(1500)
ok(await d.locator(`[data-chamado="${numero}"]`).count() === 0, 'quem não é da equipe NÃO vê o chamado')
await d.goto(PH + '/abrir'); await d.waitForSelector('[data-tipo=incidente]'); await d.locator('[data-tipo=incidente]').click()
await d.selectOption('#ab-assunto', { label: 'E4UI CFTV' }); await d.selectOption('#ab-unidade', { index: 1 }); await d.waitForTimeout(2500)
await d.getByTestId('aviso-parecidos').waitFor({ timeout: 10000 })
const avTxt = await d.getByTestId('aviso-parecidos').innerText()
ok(avTxt.includes(numero) && !avTxt.includes('Ana'), 'aviso de chamado parecido na mesma unidade e assunto (sem revelar quem abriu)')
ok(await d.locator('#ab-titulo').count() === 0, 'enquanto o aviso está aberto, o resto do formulário espera a decisão')
await d.getByTestId('parecido-tambem-afeta').click(); await d.waitForSelector('[data-testid=portal-chamado]', { timeout: 15000 }); await d.waitForTimeout(1500)
ok(await d.locator('[data-numero="' + numero + '"]').count() === 1 && (await d.getByTestId('afetados').innerText()).includes('2 pessoas afetadas'), '"também me afeta": passa a acompanhar o chamado; 2 pessoas afetadas')
await d.goto(PH + '/abrir'); await d.waitForSelector('[data-tipo=incidente]'); await d.locator('[data-tipo=incidente]').click(); await d.selectOption('#ab-assunto', { label: 'E4UI CFTV' }); await d.selectOption('#ab-unidade', { index: 1 }); await d.waitForTimeout(2500)
await d.getByTestId('outro-problema').click(); await d.waitForSelector('#ab-titulo')
ok(true, '"É outro problema, continuar" libera o formulário')

// ===== Ana: visita com datas e calendário (celular)
const m = await nova({ ...devices['iPhone 13'], permissions: ['microphone'] }); await entrar(m, 'e4ui.ana@example.com')
await m.goto(PH + '/abrir'); await m.waitForSelector('[data-tipo=visita]')
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'abrir chamado no celular: sem rolagem horizontal')
await m.locator('[data-tipo=visita]').click(); await m.selectOption('#ab-assunto', { label: 'E4UI CFTV' })
ok(await m.getByTestId('bloco-datas').count() === 1 && await m.getByTestId('bloco-prioridade').count() === 0, 'visita: pergunta as datas (e não a prioridade)')
const dom = new Date(); dom.setDate(dom.getDate() + ((7 - dom.getDay()) % 7 || 7) + 7); const domStr = `${dom.getFullYear()}-${String(dom.getMonth() + 1).padStart(2, '0')}-${String(dom.getDate()).padStart(2, '0')}`   // data LOCAL (toISOString em UTC vira segunda depois das 21h no Brasil)
await m.locator('[data-data="0"]').fill(domStr); await m.waitForTimeout(2500)
ok(await m.locator('[data-aviso-data="0"]').count() === 1, 'uma data de domingo mostra o aviso do calendário da unidade')
await m.fill('#ab-titulo', 'E4UI Visita de avaliação'); await m.fill('#ab-desc', 'Preciso de uma visita para avaliar a instalação.')
await m.getByTestId('enviar-chamado').click(); await m.waitForSelector('[data-testid=chamado-registrado]', { timeout: 25000 })
const nv = await m.getByTestId('numero-novo').innerText()
const ov = sql(`select priority, prioridade_informada, jsonb_array_length(preferencia_agendamento) n from orders where number='${nv}'`)[0]
ok(ov.priority === 'visita' && ov.prioridade_informada === null && ov.n === 1, 'visita: sem SLA, preferência de data guardada')
await m.screenshot({ path: N + '/e4_registrado_celular.png', fullPage: true })

// ===== Preferências
await a.goto(PH + '/preferencias'); await a.waitForSelector('[data-testid=portal-preferencias]')
ok(await a.getByTestId('canal-whatsapp-indisponivel').count() === 1, 'WhatsApp aparece como indisponível (sem prometer o que ainda não existe)')
await a.getByTestId('pref-consentimento').check(); await a.getByTestId('pref-salvar').click(); await a.waitForTimeout(1800)
ok(sql(`select count(*)::int n from termos_aceites a join termos t on t.id=a.termo_id where a.user_id='${ana}' and t.tipo='comunicacao' and a.revogado_em is null`)[0].n === 1, 'dar o consentimento de comunicação nas preferências é registrado')
await a.getByTestId('pref-consentimento').uncheck(); await a.getByTestId('pref-salvar').click(); await a.waitForTimeout(1800)
ok(sql(`select count(*)::int n from termos_aceites a join termos t on t.id=a.termo_id where a.user_id='${ana}' and t.tipo='comunicacao' and a.revogado_em is null`)[0].n === 0, 'retirar o consentimento (LGPD) também')
sql(`update tenants set portal_abertura='{"canais":{"email":false}}' where id='${T}'`)
await a.reload(); await a.waitForSelector('[data-testid=portal-preferencias]')
ok(await a.getByTestId('canal-email-indisponivel').count() === 1, 'canal que a empresa não liberou: "não disponibiliza avisos por e-mail no momento"')
sql(`update tenants set portal_abertura='{}' where id='${T}'`)
await a.screenshot({ path: N + '/e4_chamados_desktop.png' })
console.log('erros:', erros.filter(e => !/favicon/.test(e)))
sql(`delete from orders where title like 'E4UI %'; delete from auth.users where email like 'e4ui.%'; delete from portal_pessoas where email like 'e4ui.%'; delete from portal_convites where email like 'e4ui.%'; delete from portal_equipes where nome like 'E4UI %'; delete from os_categorias where nome like 'E4UI %'`)
sql(`delete from storage.objects where bucket_id='portal-anexos' and name like '%/${ana}/%'`)
resumo(); await b.close()
