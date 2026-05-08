import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oexjfpzlzwjyvjfircyg.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGpmcHpsendqeXZqZmlyY3lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQzNDgyNSwiZXhwIjoyMDkzMDEwODI1fQ.UGefqh-_dLf3QFrz-DFRlMPowFj3CM-fUNwtfOE6yPI';
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  // First, find the latest user
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 10
  });
  
  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }
  
  // Sort users by created_at descending (or last_sign_in_at)
  const sortedUsers = users.users.sort((a, b) => new Date(b.last_sign_in_at || b.created_at) - new Date(a.last_sign_in_at || a.created_at));
  
  if (sortedUsers.length === 0) {
    console.log('No users found.');
    return;
  }
  
  const latestUser = sortedUsers[0];
  console.log('Found latest user:', latestUser.id, 'last_sign_in_at:', latestUser.last_sign_in_at);
  
  // Grant pro_monthly for 30 days
  const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase.from('entitlements').upsert({
    user_id: latestUser.id,
    plan_id: 'pro_monthly',
    status: 'active',
    current_period_end: until,
    source: 'admin',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id, plan_id' });
  
  if (error) {
    console.error('Error granting entitlement:', error);
  } else {
    console.log('Successfully upgraded user to Pro!');
  }
}

main();
