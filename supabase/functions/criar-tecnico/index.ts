import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, password, phone } = await req.json()

    if (!name || !email || !password) {
      return new Response(
        JSON.stringify({ error: 'Nome, e-mail e senha são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cliente com a service_role (admin) — só existe no servidor
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Cliente autenticado como o usuário que chamou (para validar quem é)
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Identifica o usuário que está chamando
    const { data: { user: caller }, error: callerErr } = await supabaseCaller.auth.getUser()
    if (callerErr || !caller) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Busca o perfil do chamador (role + tenant) usando a service_role
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('role, tenant_id')
      .eq('id', caller.id)
      .single()

    if (profileErr || !callerProfile) {
      return new Response(
        JSON.stringify({ error: 'Perfil do solicitante não encontrado.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Só admin ou gestor podem criar técnicos
    if (!['admin', 'gestor', 'super_admin'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Sem permissão para criar técnicos.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cria o usuário no Auth (já confirmado)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'tecnico' },
    })

    if (createErr || !created.user) {
      return new Response(
        JSON.stringify({ error: createErr?.message ?? 'Falha ao criar o acesso.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Atualiza o perfil criado pelo trigger: role tecnico + tenant + nome + telefone
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        role: 'tecnico',
        tenant_id: callerProfile.tenant_id,
        name,
        phone: phone ?? null,
      })
      .eq('id', created.user.id)

    if (updateErr) {
      // rollback: remove o usuário do Auth se não conseguiu vincular o perfil
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return new Response(
        JSON.stringify({ error: 'Falha ao vincular o técnico ao perfil.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: created.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
