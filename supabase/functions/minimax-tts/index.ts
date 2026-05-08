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

  const apiKey = Deno.env.get('MINIMAX_API_KEY') ?? '';
  const groupId = Deno.env.get('MINIMAX_GROUP_ID') ?? '';
  if (!apiKey || !groupId) return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500, headers });

  const body = await req.json().catch(() => null);
  const voiceId = String(body?.voiceId ?? '').trim();
  const text = String(body?.text ?? '').trim();
  const texts = Array.isArray(body?.texts)
    ? body.texts.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
    : [];
  if (!voiceId || (!text && texts.length === 0)) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers });
  }

  const apiUrl = `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`;
  const requestOne = async (inputText: string) => {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'speech-01-turbo',
        text: inputText,
        stream: false,
        voice_setting: { voice_id: voiceId, speed: 0.85, vol: 1.0, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' }
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`upstream_http_${response.status}`);
    const statusCode = Number(data?.base_resp?.status_code ?? -1);
    if (statusCode !== 0) throw new Error('upstream_status');
    const hexAudio = String(data?.data?.audio ?? '').trim();
    if (!hexAudio) throw new Error('empty_audio');
    return hexAudio;
  };

  const requestWithRetry = async (inputText: string) => {
    let attempt = 0;
    let waitMs = 350;
    while (attempt < 3) {
      try {
        return await requestOne(inputText);
      } catch {
        attempt += 1;
        if (attempt >= 3) break;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        waitMs *= 2;
      }
    }
    return '';
  };

  if (texts.length > 0) {
    const audioHexList: string[] = [];
    for (const t of texts) {
      const hex = await requestWithRetry(t);
      audioHexList.push(hex);
    }
    const successCount = audioHexList.filter(Boolean).length;
    if (successCount === 0) {
      return new Response(JSON.stringify({ error: 'upstream_error' }), { status: 502, headers });
    }
    return new Response(JSON.stringify({ audioHexList }), { status: 200, headers });
  }

  const single = await requestWithRetry(text);
  if (!single) return new Response(JSON.stringify({ error: 'upstream_error' }), { status: 502, headers });
  return new Response(JSON.stringify({ audioHex: single }), { status: 200, headers });
});
