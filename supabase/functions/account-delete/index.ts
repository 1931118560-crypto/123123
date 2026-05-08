import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS'
  };
}

async function requireUser(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!supabaseUrl || !anonKey || !auth) return null;
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders() });
  const headers = { ...corsHeaders(), 'content-type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });

  const user = await requireUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500, headers });

  const admin = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => null);
  const deviceKey = String(body?.deviceKey ?? '').trim();

  try {
    await admin.from('entitlements').delete().eq('user_id', user.id);
    await admin.from('purchases').delete().eq('user_id', user.id);

    const deviceKeys = new Set<string>();
    if (deviceKey) deviceKeys.add(deviceKey);

    const { data: userDevices } = await admin
      .from('devices')
      .select('device_key')
      .eq('user_id', user.id);
    for (const row of userDevices ?? []) {
      const key = String((row as any)?.device_key ?? '').trim();
      if (key) deviceKeys.add(key);
    }

    const allDeviceKeys = Array.from(deviceKeys);
    if (allDeviceKeys.length > 0) {
      await admin.from('ai_interactions').delete().in('device_key', allDeviceKeys);
      await admin.from('app_events').delete().in('device_key', allDeviceKeys);
      await admin.from('devices').delete().in('device_key', allDeviceKeys);
    }

    // Compatibility path: if schema already has devices.user_id, this removes residual rows.
    const { error: deleteByUserError } = await admin.from('devices').delete().eq('user_id', user.id);
    if (deleteByUserError && !String(deleteByUserError.message ?? '').toLowerCase().includes('user_id')) {
      throw deleteByUserError;
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      return new Response(JSON.stringify({ error: 'delete_user_failed', detail: deleteUserError.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'internal_error', detail: String((error as Error)?.message ?? error) }),
      { status: 500, headers }
    );
  }
});
