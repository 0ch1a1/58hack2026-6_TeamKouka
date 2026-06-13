import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui';
import { colors } from '../lib/theme';
import { fetchRegionalStats, type RegionalStats } from '../features/stats';

// 機能③ 地域貢献カード。3指標（再配達防止件数 / CO2削減kg合計 / 協力者数）を
// 集計して表示する軽量カード。集計取得は features/stats.ts に分離。
//
// MVP は「全体集計カード1枚」。地図・地域別ランキングは将来枠。
type Metric = {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
};

export function RegionalContributionCard({ style }: { style?: object }) {
  const [stats, setStats] = useState<RegionalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await fetchRegionalStats();
        if (active) setStats(s);
      } catch {
        // 取得失敗時は 0 件のカードを出して描画は継続（既存UXと同じく握りつぶし）
        if (active) setStats({ preventedRedeliveries: 0, totalCo2SavedKg: 0, helperCount: 0 });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const metrics: Metric[] = [
    {
      icon: 'repeat',
      value: String(stats?.preventedRedeliveries ?? 0),
      label: '再配達を防止',
    },
    {
      icon: 'leaf',
      value: `${stats?.totalCo2SavedKg ?? 0}`,
      label: 'CO2削減 (kg)',
    },
    {
      icon: 'people',
      value: String(stats?.helperCount ?? 0),
      label: '協力者',
    },
  ];

  return (
    <Card style={style}>
      <View style={styles.titleRow}>
        <Ionicons name="earth" size={18} color={colors.green} />
        <Text style={styles.title}>みんなの ShareKeep</Text>
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.green} />
        </View>
      ) : (
        <View style={styles.metricsRow}>
          {metrics.map((m) => (
            <View key={m.label} style={styles.metric}>
              <Ionicons name={m.icon} size={22} color={colors.green} />
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  loadingWrap: { paddingVertical: 16, alignItems: 'center' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  metric: { alignItems: 'center', gap: 4, flex: 1 },
  metricValue: { fontSize: 22, fontWeight: '800', color: colors.green },
  metricLabel: { fontSize: 12, color: colors.gray, textAlign: 'center' },
});
