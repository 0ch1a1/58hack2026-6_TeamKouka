// =============================================================================
// 複数端末デモ用の3ロール既知ログイン整備スクリプト（Approach A）
//
// 目的: 受取人T / 配達員 / 代理人みどり商店 の3端末で確実にログインできるよう、
//   既知パスワードへリセット（受取人・配達員）し、3ログインを見やすく出力する。
//   代理人はパスワード既知（seed-agents.ts の SEED_PASSWORD）なので存在確認のみ。
//
// 実行方法:
//   1. ShareKeep/ 直下に .env を置くか、env を直接設定する:
//        SUPABASE_URL=https://zbmrmblakoszzecdnptn.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=<service role key>   # 公開禁止
//      （任意）DEMO_ACCOUNT_PASSWORD=<任意の既知パスワード>   # 未設定なら既定値
//   2. ShareKeep/ で実行:
//        npx tsx scripts/seed-demo-accounts.ts
//
// 冪等: 再実行しても壊れない（updateUserById でパスワードを上書きするだけ）。
//   DB行の作成・削除は行わない（既存 auth ユーザーのパスワード更新と存在確認のみ）。
// =============================================================================

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env') });

const PROJECT_ID = 'zbmrmblakoszzecdnptn';

// 受取人・配達員に設定する既知パスワード（env で上書き可）。
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? 'ShareKeepDemo2026!';
// 代理人 seed のパスワード（seed-agents.ts と同じ既定値。env で上書き可）。
const SEED_AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD ?? 'ShareKeepSeedAgent2026!';

// 固定 ID（A0 で remote zbmrmblakoszzecdnptn 実査済み）。
const RECIPIENT_T_ID = 'd4890a29-1251-4ff5-a4b6-3c75d910c76c'; // role=recipient, full_name='T'
const DRIVER_ID = '3dc3d4ff-ec93-45c3-9c37-2cf76e817061'; // role=delivery_company, full_name='田中渓都'
// 代理人みどり商店として使う seed エージェント（demo_setup.sql で『みどり商店』へ改名）。
const AGENT_DEMO_EMAIL = 'sharekeep-seed-agent-1@example.com';

type LoginRow = {
  role: string;
  email: string;
  password: string;
  note: string;
};

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

// 指定 ID の auth ユーザーを既知パスワードへリセットし、email を返す（冪等）。
async function resetPasswordById(
  supabase: SupabaseClient,
  userId: string,
  password: string,
  label: string,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to reset password for ${label} (${userId}): ${error.message}`);
  const email = data.user?.email;
  if (!email) {
    throw new Error(`Auth user ${label} (${userId}) has no email. Check the user exists.`);
  }
  console.log(`Reset password: ${label} -> ${email} (${userId})`);
  return email;
}

// email から auth ユーザーを探し、存在確認する（パスワードは変更しない）。
async function findUserByEmail(supabase: SupabaseClient, email: string) {
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function main() {
  const supabase = createServiceClient();
  const logins: LoginRow[] = [];

  // 1) 受取人 T: パスワードを既知値へリセット。
  const recipientEmail = await resetPasswordById(
    supabase, RECIPIENT_T_ID, DEMO_PASSWORD, 'recipient T',
  );
  logins.push({ role: 'recipient (受取人T)', email: recipientEmail, password: DEMO_PASSWORD, note: "full_name='T'" });

  // 2) 配達員: パスワードを既知値へリセット。
  const driverEmail = await resetPasswordById(
    supabase, DRIVER_ID, DEMO_PASSWORD, 'delivery_company (driver)',
  );
  logins.push({ role: 'delivery_company (配達員)', email: driverEmail, password: DEMO_PASSWORD, note: "full_name='田中渓都'" });

  // 3) 代理人みどり商店: 既存 seed のログインを存在確認（パスワード既知のためリセット不要）。
  const agentUser = await findUserByEmail(supabase, AGENT_DEMO_EMAIL);
  if (!agentUser) {
    console.warn(
      `Warning: agent seed user not found: ${AGENT_DEMO_EMAIL}. ` +
      `Run scripts/seed-agents.ts first.`,
    );
    logins.push({
      role: 'agent (代理人みどり商店)',
      email: `${AGENT_DEMO_EMAIL} (NOT FOUND - run seed-agents.ts)`,
      password: SEED_AGENT_PASSWORD,
      note: 'demo_setup.sql で full_name=みどり商店 に改名される',
    });
  } else {
    console.log(`Confirmed agent seed user: ${AGENT_DEMO_EMAIL} (${agentUser.id})`);
    logins.push({
      role: 'agent (代理人みどり商店)',
      email: AGENT_DEMO_EMAIL,
      password: SEED_AGENT_PASSWORD,
      note: 'demo_setup.sql で full_name=みどり商店 に改名される',
    });
  }

  console.log('\n===== デモ用3ロール ログイン情報 =====');
  console.table(logins);
  console.log('注意: SUPABASE_SERVICE_ROLE_KEY と上記パスワードは秘匿情報。共有時は安全な経路で。');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
