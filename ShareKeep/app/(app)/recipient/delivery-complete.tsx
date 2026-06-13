import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { fetchParcel } from '../../../features/parcels';
import { colors } from '../../../lib/theme';
import { PrimaryButton, Card, InfoRow } from '../../../components/ui';

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
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // point_transactions には feature 関数がないため直接読みのまま残置。
        // RLS が無い前提でも他人のポイントを表示しないよう user_id で必ず絞る（B4 バグ修正）。
        // 報酬の付与先は代理人（transaction_type='proxy_delivery_complete'）であり、
        // 受取人自身の行は通常0件になりうる点に注意。
        const [parcel, pointRes] = await Promise.all([
          fetchParcel(parcelId),
          user
            ? supabase
                .from('point_transactions')
                .select('points')
                .eq('user_id', user.id)
                .eq('transaction_type', 'proxy_delivery_complete')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        setResult({
          trackingNo: parcel?.tracking_no ?? '—',
          co2Saved: Number(parcel?.co2_saved_kg ?? 0),
          pointsEarned: pointRes.data?.points ?? 0,
        });
      } catch {
        // 取得失敗時も結果画面はデフォルト表示で継続（既存UXを維持）
        setResult({ trackingNo: '—', co2Saved: 0, pointsEarned: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [parcelId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
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

        <Card>
          <Text style={styles.cardSectionTitle}>CO2削減への貢献</Text>
          <View style={styles.co2Row}>
            <Ionicons name="leaf" size={32} color={colors.green} />
            <View style={styles.co2TextWrap}>
              <Text style={styles.co2Value}>{result?.co2Saved ?? 0} kg</Text>
              <Text style={styles.co2Label}>今回のCO2推定削減量</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardSectionTitle}>獲得報酬</Text>
          <View style={styles.rewardRow}>
            <View style={styles.rewardItem}>
              <Ionicons name="gift" size={28} color={colors.green} />
              <Text style={styles.rewardValue}>{result?.pointsEarned ?? 0}</Text>
              <Text style={styles.rewardLabel}>ポイント</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardSectionTitle}>荷物の情報</Text>
          <InfoRow label="追跡番号" value={result?.trackingNo ?? '—'} />
        </Card>

        <PrimaryButton
          label="ホームへ戻る"
          icon="home-outline"
          onPress={() => router.replace('/(app)/')}
          style={styles.primaryButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 40, gap: 16 },
  heroSection: { alignItems: 'center', gap: 12, marginBottom: 8 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', shadowColor: colors.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  heroDesc: { fontSize: 15, color: colors.gray },
  cardSectionTitle: { fontSize: 13, fontWeight: '600', color: colors.grayLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  co2Row: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.greenLight, borderRadius: 12, padding: 16 },
  co2TextWrap: { gap: 2 },
  co2Value: { fontSize: 28, fontWeight: '800', color: colors.green },
  co2Label: { fontSize: 13, color: colors.greenDark },
  rewardRow: { flexDirection: 'row', alignItems: 'center' },
  rewardItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  rewardValue: { fontSize: 24, fontWeight: '800', color: colors.ink },
  rewardLabel: { fontSize: 13, color: colors.gray },
  primaryButton: { marginTop: 8 },
});
