import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

// TODO: Supabase から co2_saved / xp を取得
const MOCK_RESULT = {
  co2Saved: 0.5,
  xpEarned: 120,
  pointsEarned: 50,
};

export default function DeliveryCompleteScreen() {
  const { packageName, trackingNumber } = useLocalSearchParams<{
    packageName: string;
    trackingNumber: string;
  }>();

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
              <Text style={styles.co2Value}>{MOCK_RESULT.co2Saved} kg</Text>
              <Text style={styles.co2Label}>今回のCO2推定削減量</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>獲得報酬</Text>
          <View style={styles.rewardRow}>
            <View style={styles.rewardItem}>
              <Ionicons name="star" size={28} color="#F59E0B" />
              <Text style={styles.rewardValue}>{MOCK_RESULT.xpEarned}</Text>
              <Text style={styles.rewardLabel}>XP</Text>
            </View>
            <View style={styles.rewardDivider} />
            <View style={styles.rewardItem}>
              <Ionicons name="gift" size={28} color={GREEN} />
              <Text style={styles.rewardValue}>{MOCK_RESULT.pointsEarned}</Text>
              <Text style={styles.rewardLabel}>ポイント</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>荷物の情報</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>荷物名</Text>
            <Text style={styles.infoValue}>{packageName ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>追跡番号</Text>
            <Text style={styles.infoValue}>{trackingNumber ?? '—'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/(app)/')}
        >
          <Ionicons name="home-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>ホームへ戻る</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 40,
    gap: 16,
  },
  heroSection: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  heroDesc: {
    fontSize: 15,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  co2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 16,
  },
  co2TextWrap: {
    gap: 2,
  },
  co2Value: {
    fontSize: 28,
    fontWeight: '800',
    color: GREEN,
  },
  co2Label: {
    fontSize: 13,
    color: '#059669',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  rewardDivider: {
    width: 1,
    height: 60,
    backgroundColor: '#F3F4F6',
  },
  rewardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  rewardLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    width: 72,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
