import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
};

export const getParcels = async (recipientId: string) => {
  const { data, error } = await supabase
    .from('parcels')
    .select('*, delivery_companies(name)')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false });
  return { data, error };
};

export const getAgentProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error };
};

export const upsertAgentProfile = async (profile: Partial<import('./database.types').AgentProfile> & { user_id: string }) => {
  const { data, error } = await supabase
    .from('agent_profiles')
    .upsert(profile, { onConflict: 'user_id' });
  return { data, error };
};

export const getDeliveryMatch = async (parcelId: string) => {
  const { data, error } = await supabase
    .from('delivery_matches')
    .select('*, profiles!agent_id(full_name, phone)')
    .eq('parcel_id', parcelId)
    .single();
  return { data, error };
};
