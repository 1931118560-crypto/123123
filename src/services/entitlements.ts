import { supabase } from './supabase';

export type EntitlementStatus = 'active' | 'trialing' | 'grace_period' | 'canceled' | 'expired';

export type Entitlement = {
  id: string;
  user_id: string;
  plan_id: string;
  status: EntitlementStatus;
  current_period_end: string | null;
  source: string;
  device_key: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchMyEntitlements() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('entitlements')
    .select('id,user_id,plan_id,status,current_period_end,source,device_key,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Entitlement[];
}

export function isPro(entitlements: Entitlement[]) {
  const active = entitlements.find((e) => e.plan_id.startsWith('pro_') && (e.status === 'active' || e.status === 'trialing' || e.status === 'grace_period'));
  return Boolean(active);
}
