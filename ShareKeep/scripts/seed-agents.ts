import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env') });

const PROJECT_ID = 'zbmrmblakoszzecdnptn';
const CENTER = { lat: 35.6812, lng: 139.7671 };
const RADIUS_METERS = 2000;
const SEED_PASSWORD = process.env.SEED_AGENT_PASSWORD ?? 'ShareKeepSeedAgent2026!';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type Day = (typeof DAYS)[number];

type SeedAgent = {
  index: number;
  email: string;
  fullName: string;
  address: string;
  addressDetail: string;
  lat: number;
  lng: number;
  availableDays: Day[];
  startTime: string;
  endTime: string;
  level: number;
  completedDeliveries: number;
  points: number;
  note: string;
};

type RecommendationCandidate = {
  user_id: string;
  full_name: string | null;
  address: string | null;
  address_detail: string | null;
  distance_meters: number | null;
  available_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  level: number | null;
  completed_deliveries: number | null;
  points: number | null;
  active_load: number | null;
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

function getJstDay(): Day {
  const shortDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(new Date()).toLowerCase();

  const day = shortDay.slice(0, 3) as Day;
  if (!DAYS.includes(day)) {
    throw new Error(`Could not resolve current JST day from ${shortDay}`);
  }
  return day;
}

function getOffHourWindow() {
  const hourText = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  const currentHour = Number(hourText === '24' ? '0' : hourText);
  const startHour = (currentHour + 8) % 24;
  const endHour = (startHour + 1) % 24;

  return {
    startTime: `${String(startHour).padStart(2, '0')}:00`,
    endTime: `${String(endHour).padStart(2, '0')}:00`,
  };
}

function nextDay(day: Day): Day {
  const index = DAYS.indexOf(day);
  return DAYS[(index + 1) % DAYS.length];
}

function buildSeedAgents(): SeedAgent[] {
  const today = getJstDay();
  const tomorrow = nextDay(today);
  const offHours = getOffHourWindow();
  const allDays = [...DAYS];
  const weekdays: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const weekend: Day[] = ['sat', 'sun'];

  return [
    {
      index: 1,
      email: 'sharekeep-seed-agent-1@example.com',
      fullName: 'ShareKeep Demo Agent 01 Main',
      address: 'Tokyo Station Yaesu North Area',
      addressDetail: 'Main candidate: close, available now, high history',
      lat: 35.6817,
      lng: 139.76805,
      availableDays: allDays,
      startTime: '00:00',
      endTime: '23:59',
      level: 5,
      completedDeliveries: 82,
      points: 2450,
      note: 'close + available now + many deliveries',
    },
    {
      index: 2,
      email: 'sharekeep-seed-agent-2@example.com',
      fullName: 'ShareKeep Demo Agent 02 Off Window',
      address: 'Tokyo Station Marunouchi Central Area',
      addressDetail: 'Close but deliberately outside day and time',
      lat: 35.6811,
      lng: 139.76535,
      availableDays: [tomorrow],
      startTime: offHours.startTime,
      endTime: offHours.endTime,
      level: 4,
      completedDeliveries: 45,
      points: 1320,
      note: 'close but unavailable',
    },
    {
      index: 3,
      email: 'sharekeep-seed-agent-3@example.com',
      fullName: 'ShareKeep Demo Agent 03 Average South',
      address: 'Tokyo International Forum Area',
      addressDetail: 'Mid distance and average profile',
      lat: 35.67835,
      lng: 139.76735,
      availableDays: [today, tomorrow],
      startTime: '09:00',
      endTime: '20:00',
      level: 3,
      completedDeliveries: 18,
      points: 760,
      note: 'mid distance + average',
    },
    {
      index: 4,
      email: 'sharekeep-seed-agent-4@example.com',
      fullName: 'ShareKeep Demo Agent 04 Low History',
      address: 'Kyobashi Station Area',
      addressDetail: 'Mid distance, available now, low history',
      lat: 35.6818,
      lng: 139.773,
      availableDays: allDays,
      startTime: '00:00',
      endTime: '23:59',
      level: 1,
      completedDeliveries: 0,
      points: 80,
      note: 'available now + low history',
    },
    {
      index: 5,
      email: 'sharekeep-seed-agent-5@example.com',
      fullName: 'ShareKeep Demo Agent 05 Weekday Balanced',
      address: 'Otemachi Area',
      addressDetail: 'Middle distance with weekday schedule',
      lat: 35.6866,
      lng: 139.7623,
      availableDays: weekdays,
      startTime: '08:00',
      endTime: '18:00',
      level: 2,
      completedDeliveries: 7,
      points: 320,
      note: 'middle distance + modest history',
    },
    {
      index: 6,
      email: 'sharekeep-seed-agent-6@example.com',
      fullName: 'ShareKeep Demo Agent 06 Weekend Runner',
      address: 'Ginza Itchome Area',
      addressDetail: 'Middle distance with weekend-heavy schedule',
      lat: 35.6748,
      lng: 139.775,
      availableDays: weekend,
      startTime: '10:00',
      endTime: '22:00',
      level: 4,
      completedDeliveries: 29,
      points: 1180,
      note: 'middle distance + stronger history',
    },
    {
      index: 7,
      email: 'sharekeep-seed-agent-7@example.com',
      fullName: 'ShareKeep Demo Agent 07 North Average',
      address: 'Kanda South Area',
      addressDetail: 'Farther middle candidate with lower level',
      lat: 35.693,
      lng: 139.7695,
      availableDays: [today],
      startTime: '07:00',
      endTime: '19:00',
      level: 2,
      completedDeliveries: 12,
      points: 430,
      note: 'farther middle + average history',
    },
    {
      index: 8,
      email: 'sharekeep-seed-agent-8@example.com',
      fullName: 'ShareKeep Demo Agent 08 Far Reliable',
      address: 'Shimbashi North Area',
      addressDetail: 'Far but available now and high history',
      lat: 35.6663,
      lng: 139.769,
      availableDays: allDays,
      startTime: '00:00',
      endTime: '23:59',
      level: 5,
      completedDeliveries: 70,
      points: 2180,
      note: '1500m+ but available now + many deliveries',
    },
  ];
}

async function listSeedUsers(
  supabase: SupabaseClient,
  emails: Set<string>,
) {
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

async function getOrCreateAuthUser(
  supabase: SupabaseClient,
  seed: SeedAgent,
  usersByEmail: Map<string, User>,
) {
  const existingUser = usersByEmail.get(seed.email);
  if (existingUser) {
    console.log(`Reuse auth user: ${seed.email} (${existingUser.id})`);
    return existingUser;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: seed.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: seed.fullName,
      seed: 'sharekeep-agent-demo',
    },
  });

  if (error) throw error;
  if (!data.user) {
    throw new Error(`Auth user was not returned for ${seed.email}`);
  }

  usersByEmail.set(seed.email, data.user);
  console.log(`Created auth user: ${seed.email} (${data.user.id})`);
  return data.user;
}

async function upsertProfile(
  supabase: SupabaseClient,
  userId: string,
  fullName: string,
) {
  const profile = {
    id: userId,
    role: 'agent',
    full_name: fullName,
  };

  const { data, error: selectError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (data) {
    const { error } = await supabase
      .from('profiles')
      .update(profile)
      .eq('id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('profiles').insert(profile);
    if (error) throw error;
  }
}

async function upsertAgentProfile(
  supabase: SupabaseClient,
  userId: string,
  seed: SeedAgent,
) {
  const { error: rpcError } = await supabase.rpc('upsert_agent_profile', {
    p_user_id: userId,
    p_address: seed.address,
    p_lat: seed.lat,
    p_lng: seed.lng,
    p_available_days: seed.availableDays,
    p_start_time: seed.startTime,
    p_end_time: seed.endTime,
    p_address_detail: seed.addressDetail,
  });

  if (rpcError) throw rpcError;

  const { error: updateError } = await supabase
    .from('agent_profiles')
    .update({
      level: seed.level,
      completed_deliveries: seed.completedDeliveries,
      points: seed.points,
    })
    .eq('user_id', userId);

  if (updateError) throw updateError;
}

async function printRecommendationCandidates(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_recommendation_candidates', {
    p_lat: CENTER.lat,
    p_lng: CENTER.lng,
    p_radius_m: RADIUS_METERS,
  });

  if (error) throw error;

  const rows = [...((data ?? []) as RecommendationCandidate[])]
    .sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity))
    .map((candidate, index) => ({
      rank: index + 1,
      name: candidate.full_name,
      distance_m: Math.round(candidate.distance_meters ?? 0),
      days: candidate.available_days?.join(',') ?? '',
      time: `${candidate.start_time ?? ''}-${candidate.end_time ?? ''}`,
      level: candidate.level,
      completed: candidate.completed_deliveries,
      points: candidate.points,
      active_load: candidate.active_load,
    }));

  console.log(`Recommendation candidates within ${RADIUS_METERS}m from ${CENTER.lat}, ${CENTER.lng}:`);
  console.table(rows);
}

async function main() {
  const supabase = createServiceClient();
  const seeds = buildSeedAgents();
  const seedEmails = new Set(seeds.map((seed) => seed.email));
  const usersByEmail = await listSeedUsers(supabase, seedEmails);

  for (const seed of seeds) {
    const user = await getOrCreateAuthUser(supabase, seed, usersByEmail);
    await upsertProfile(supabase, user.id, seed.fullName);
    await upsertAgentProfile(supabase, user.id, seed);
    console.log(`Seeded ${seed.index}: ${seed.fullName} (${seed.note})`);
  }

  await printRecommendationCandidates(supabase);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
