import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

// 代理人情報の取得。B3（pickup-ready）で当面使用するため残置（A7）。
// その他の旧ヘルパ（getParcels / getAgentProfile / lib版 upsertAgentProfile /
// getProfile / getCurrentUser）は features/ に置換され dead code のため削除済み。
export const getDeliveryMatch = async (parcelId: string) => {
  const { data, error } = await supabase
    .from('delivery_matches')
    .select('*, profiles!agent_id(full_name, phone)')
    .eq('parcel_id', parcelId)
    .single();
  return { data, error };
};
