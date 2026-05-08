import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oexjfpzlzwjyvjfircyg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9leGpmcHpsendqeXZqZmlyY3lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzQ4MjUsImV4cCI6MjA5MzAxMDgyNX0.8R4CrLDmVqyar2Xi-XdOuFyS3nLQmZukrwku_CogRXw';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('devices').select('user_id').order('last_seen', { ascending: false }).limit(1);
  if (error) {
    console.error('Error fetching devices:', error);
  } else {
    console.log('Latest user_id from devices:', data[0]?.user_id);
  }
}
main();
