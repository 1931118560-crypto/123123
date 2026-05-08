import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oexjfpzlzwjyvjfircyg.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGpmcHpsendqeXZqZmlyY3lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQzNDgyNSwiZXhwIjoyMDkzMDEwODI1fQ.UGefqh-_dLf3QFrz-DFRlMPowFj3CM-fUNwtfOE6yPI';
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  // Find the most recently created or logged-in user
  users.sort((a, b) => new Date(b.last_sign_in_at || b.created_at) - new Date(a.last_sign_in_at || a.created_at));
  const targetUser = users[0];
  console.log('Target User:', targetUser.id, targetUser.email || 'anonymous', targetUser.last_sign_in_at);

  // Upgrade user to Pro
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 100);

  const { data: entitlement, error: entError } = await supabase
    .from('entitlements')
    .upsert({
      user_id: targetUser.id,
      plan_id: 'pro_monthly',
      status: 'active',
      current_period_end: futureDate.toISOString(),
      source: 'admin_script',
      device_key: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,plan_id' })
    .select();

  if (entError) {
    console.error('Error upgrading user:', entError);
  } else {
    console.log('Successfully upgraded user to Pro! Entitlement:', entitlement);
  }
}
main();
