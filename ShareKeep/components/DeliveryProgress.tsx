import { View, Text, StyleSheet, type DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { Card } from './ui';

type Props = {
  progress: number;
  updatedAt?: string | null;
};

export function normalizeTrackingProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function estimateRemainingMinutes(progress: number) {
  const normalized = normalizeTrackingProgress(progress);
  if (normalized >= 100) return 0;
  return Math.max(1, Math.ceil((100 - normalized) / 10));
}

function formatUpdatedAt(updatedAt?: string | null) {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function DeliveryProgress({ progress, updatedAt }: Props) {
  const normalized = normalizeTrackingProgress(progress);
  const arrived = normalized >= 100;
  const remainingMinutes = estimateRemainingMinutes(normalized);
  const progressWidth: DimensionValue = `${normalized}%`;
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons
            name={arrived ? 'checkmark-circle' : 'navigate-circle-outline'}
            size={18}
            color={arrived ? colors.greenDark : colors.green}
          />
          <Text style={styles.title}>
            {arrived ? '代理人が到着しました' : '代理人が近づいています'}
          </Text>
        </View>
        <Text style={styles.percent}>{normalized}%</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: progressWidth }]} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.eta, arrived && styles.arrivedText]}>
          {arrived ? '到着しました' : `あと約${remainingMinutes}分`}
        </Text>
        {updatedLabel ? <Text style={styles.updated}>更新 {updatedLabel}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  percent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.green,
  },
  track: {
    height: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.greenLight,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray,
  },
  arrivedText: {
    color: colors.greenDark,
  },
  updated: {
    fontSize: 12,
    color: colors.grayLight,
  },
});
