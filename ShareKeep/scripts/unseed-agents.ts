import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env') });

const PROJECT_ID = 'zbmrmblakoszzecdnptn';
const SEED_EMAILS = Array.from({ length: 8 }, (_, index) => (
  `sharekeep-seed-agent-${index + 1}@example.com`
));

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createServiceClient() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  console.log(`Target Supabase URL: ${supabaseUrl}`);
  if (!supabaseUrl.includes(PROJECT_ID)) {
    console.warn(`Warning: URL does not include expected project id ${PROJECT_ID}. Check before running.`);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function listSeedUsers(supabase: SupabaseClient) {
  const emails = new Set(SEED_EMAILS);
  const usersByEmail = new Map<string, User>();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    for (const user of data.users) {
      if (user.email && emails.has(user.email)) {
        usersByEmail.set(user.email, user);
      }
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return usersByEmail;
}

async function deletePublicRows(supabase: SupabaseClient, userId: string) {
  const { error: agentProfileError } = await supabase
    .from('agent_profiles')
    .delete()
    .eq('user_id', userId);
  if (agentProfileError) throw agentProfileError;

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (profileError) throw profileError;
}

async function main() {
  const supabase = createServiceClient();
  const usersByEmail = await listSeedUsers(supabase);

  for (const email of SEED_EMAILS) {
    const user = usersByEmail.get(email);
    if (!user) {
      console.log(`Skip missing seed user: ${email}`);
      continue;
    }

    await deletePublicRows(supabase, user.id);

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;

    console.log(`Deleted seed user: ${email} (${user.id})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
