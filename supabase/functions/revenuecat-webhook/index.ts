import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RevenueCatEvent = Record<string, any>;

function toIso(ms?: number | null) {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function normalizeEvent(body: any): RevenueCatEvent {
  if (!body) return {};
  if (body.event && typeof body.event === 'object') return body.event;
  return body;
}

function getPlanIdForEvent(event: RevenueCatEvent) {
  const entitlementIds: string[] = event.entitlement_ids ?? [];
  if (entitlementIds.includes('pro_access')) return 'pro_monthly';
  if (event.entitlement_id === 'pro_access') return 'pro_monthly';
  return null;
}

function statusForEvent(event: RevenueCatEvent) {
  const type = String(event.type ?? '').toUpperCase();
  if (type === 'CANCELLATION') return 'canceled';
  if (type === 'EXPIRATION') return 'expired';
  if (type === 'BILLING_ISSUE') return 'grace_period';
  if (type === 'UNCANCELLATION') return 'active';
  if (type === 'RENEWAL') return 'active';
  if (type === 'INITIAL_PURCHASE') return 'active';
  if (type === 'PRODUCT_CHANGE') return 'active';
  return 'active';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!expected || auth !== expected) return new Response('unauthorized', { status: 401 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return new Response('server misconfigured', { status: 500 });
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => null);
  const event = normalizeEvent(body);
  const userId = String(event.app_user_id ?? '');
  if (!userId) return new Response('missing app_user_id', { status: 400 });

  const planId = getPlanIdForEvent(event);
  const entitlementStatus = statusForEvent(event);
  const currentPeriodEnd = toIso(event.expiration_at_ms ?? null);

  const providerTxId =
    String(event.transaction_id ?? '') ||
    String(event.original_transaction_id ?? '') ||
    String(event.id ?? '');

  if (providerTxId) {
    await supabase.from('purchases').upsert(
      {
        user_id: userId,
        plan_id: planId,
        provider: 'revenuecat',
        provider_tx_id: providerTxId,
        purchased_at: toIso(event.purchased_at_ms ?? Date.now()),
        expires_at: currentPeriodEnd,
        amount_cents: event.price_in_purchased_currency != null ? Math.round(Number(event.price_in_purchased_currency) * 100) : null,
        currency: event.currency ?? null,
        status: String(event.type ?? 'unknown').toLowerCase(),
        raw: event
      },
      { onConflict: 'provider,provider_tx_id' }
    );
  }

  if (planId) {
    await supabase.from('entitlements').upsert(
      {
        user_id: userId,
        plan_id: planId,
        status: entitlementStatus,
        current_period_end: currentPeriodEnd,
        source: 'revenuecat',
        device_key: null,
        last_event: event,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,plan_id' }
    );
  }

  return new Response('ok', { status: 200 });
});
