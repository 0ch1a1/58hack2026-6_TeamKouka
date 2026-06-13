import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

type Result = {
  trackingNo: string;
  co2Saved: number;
  pointsEarned: number;
};

export default function DeliveryCompleteScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!parcelId) { setLoading(false); return; }

    const fetchData = async () => {
      const [parcelRes, pointRes] = await Promise.all([
        supabase
          .from('parcels')
          .select('tracking_no, co2_saved_kg')
          .eq('id', parcelId)
          .single(),
        supabase
          .from('point_transactions')
          .select('points')
          .eq('transaction_type', 'delivery_complete')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setResult({
        trackingNo: parcelRes.data?.tracking_no ?? '—',
        co2Saved: parcelRes.data?.co2_saved_kg ?? 0,
        pointsEarned: pointRes.data?.points ?? 0,
      });
      setLoading(false);
    };

    fetchData();
  }, [parcelId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={52} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>引き渡し完了！</Text>
          <Text style={styles.heroDesc}>荷物を無事受け取りました</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>CO2削減への貢献</Text>
          <View style={styles.co2Row}>
            <Ionicons name="leaf" size={32} color={GREEN} />
            <View style={styles.co2TextWrap}>
              <Text style={styles.co2Value}>{result?.co2Saved ?? 0} kg</Text>
              <Text style={styles.co2Label}>今回のCO2推定削減量</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>獲得報酬</Text>
          <View style={styles.rewardRow}>
            <View style={styles.rewardItem}>
              <Ionicons name="gift" size={28} color={GREEN} />
              <Text style={styles.rewardValue}>{result?.pointsEarned ?? 0}</Text>
              <Text style={styles.rewardLabel}>ポイント</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>荷物の情報</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>追跡番号</Text>
            <Text style={styles.infoValue}>{result?.trackingNo ?? '—'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(app)/')}>
          <Ionicons name="home-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>ホームへ戻る</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 40, gap: 16 },
  heroSection: { alignItems: 'center', gap: 12, marginBottom: 8 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#111827' },
  heroDesc: { fontSize: 15, color: '#6B7280' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardSectionTitle: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  co2Row: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#D1FAE5', borderRadius: 12, padding: 16 },
  co2TextWrap: { gap: 2 },
  co2Value: { fontSize: 28, fontWeight: '800', color: GREEN },
  co2Label: { fontSize: 13, color: '#059669' },
  rewardRow: { flexDirection: 'row', alignItems: 'center' },
  rewardItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  rewardValue: { fontSize: 24, fontWeight: '800', color: '#111827' },
  rewardLabel: { fontSize: 13, color: '#6B7280' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13, color: '#6B7280', width: 72 },
  infoValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
