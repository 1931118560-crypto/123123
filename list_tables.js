import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oexjfpzlzwjyvjfircyg.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGpmcHpsendqeXZqZmlyY3lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQzNDgyNSwiZXhwIjoyMDkzMDEwODI1fQ.UGefqh-_dLf3QFrz-DFRlMPowFj3CM-fUNwtfOE6yPI';
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data, error } = await supabase.from('plans').select('*');
  if (error) console.error('Error fetching plans:', error);
  else console.log('Plans:', data);
}
main();
