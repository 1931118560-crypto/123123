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

function toBase64(bytes: ArrayBuffer) {
  let binary = '';
  const arr = new Uint8Array(bytes);
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders() });
  const headers = { ...corsHeaders(), 'content-type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });

  const user = await requireUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });

  const appId = Deno.env.get('IFLYTEK_APP_ID') ?? '';
  const apiKey = Deno.env.get('IFLYTEK_API_KEY') ?? '';
  const apiSecret = Deno.env.get('IFLYTEK_API_SECRET') ?? '';
  if (!appId || !apiKey || !apiSecret) return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500, headers });

  const url = 'wss://iat-api.xfyun.cn/v2/iat';
  const host = 'iat-api.xfyun.cn';
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signatureOrigin));
  const signature = toBase64(sig);

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = btoa(authorizationOrigin);
  const authUrl = `${url}?authorization=${authorization}&date=${encodeURI(date)}&host=${host}`;

  return new Response(JSON.stringify({ url: authUrl, appId }), { status: 200, headers });
});

