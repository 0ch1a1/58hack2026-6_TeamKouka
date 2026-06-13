import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, cardShadow, radius, spacing } from '../../../lib/theme';
import { Card, InfoRow, StatusBadge, EmptyState } from '../../../components/ui';
import {
  fetchDriverParcels,
  startDelivery,
  reportDeliveryFailed,
  type DriverParcel,
} from '../../../features/parcels';
import { DRIVER_STATUS_LABEL, driverActionsFor, type DriverAction } from '../../../lib/status';
import { DEMO_DELIVERY_COMPANY_ID } from '../../../lib/config';
import { signOut } from '../../../features/auth';
import type { ParcelStatus } from '../../../lib/database.types';

// 配達員ホーム＝担当荷物リスト。status に応じたアクションボタンを出す。
// 契約（Wave 0 確定）: fetchDriverParcels / startDelivery / reportDeliveryFailed,
//   DRIVER_STATUS_LABEL / driverActionsFor, DEMO_DELIVERY_COMPANY_ID。
// 遷移: match→/(app)/driver/agents, scan→/(app)/driver/scan（いずれも parcelId 付き）。
export default function DriverHomeScreen() {
  const [parcels, setParcels] = useState<DriverParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // アクション実行中の parcelId。多重タップ防止＆ボタンの spinner 表示に使う。
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchDriverParcels(DEMO_DELIVERY_COMPANY_ID);
      setParcels(data);
    } catch {
      Alert.alert('エラー', '荷物一覧の取得に失敗しました。');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // start / fail はその場でステータス更新→一覧再取得。match / scan は別画面へ遷移。
  const handleAction = useCallback(
    async (action: DriverAction, parcel: DriverParcel) => {
      if (busyId) return;

      if (action === 'match') {
        router.push({ pathname: '/(app)/driver/agents', params: { parcelId: parcel.id } });
        return;
      }
      if (action === 'scan') {
        router.push({ pathname: '/(app)/driver/scan', params: { parcelId: parcel.id } });
        return;
      }

      setBusyId(parcel.id);
      try {
        if (action === 'start') {
          await startDelivery(parcel.id);
        } else {
          await reportDeliveryFailed(parcel.id);
        }
        await load();
      } catch {
        Alert.alert('エラー', action === 'start' ? '配達開始に失敗しました。' : '不在報告に失敗しました。');
      } finally {
        setBusyId(null);
      }
    },
    [busyId, load],
  );

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      Alert.alert('エラー', 'ログアウトに失敗しました。');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>配達員ホーム</Text>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton} accessibilityLabel="ログアウト">
          <Ionicons name="log-out-outline" size={20} color={colors.gray} />
          <Text style={styles.signOutText}>ログアウト</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.driver} />
        </View>
      ) : (
        <FlatList
          data={parcels}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.driver} />
          }
          renderItem={({ item }) => {
            const actions = driverActionsFor(item.status);
            const label = DRIVER_STATUS_LABEL[item.status as ParcelStatus] ?? String(item.status);
            const isBusy = busyId === item.id;
            return (
              <Card>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="cube-outline" size={16} color={colors.driver} />
                    <Text style={styles.cardTitle}>{item.tracking_no}</Text>
                  </View>
                  <StatusBadge label={label} color={colors.driver} bg="#E5E7EB" />
                </View>

                <InfoRow label="受取人" value={item.recipient?.full_name ?? '—'} />

                {actions.length > 0 && (
                  <View style={styles.actionRow}>
                    {actions.map(action => (
                      <ActionButton
                        key={action}
                        action={action}
                        busy={isBusy}
                        onPress={() => handleAction(action, item)}
                      />
                    ))}
                  </View>
                )}
              </Card>
            );
          }}
          ListEmptyComponent={<EmptyState icon="cube-outline" message="担当の荷物はありません" />}
        />
      )}
    </SafeAreaView>
  );
}

const ACTION_META: Record<
  DriverAction,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  start: { label: '配達開始', icon: 'play-outline' },
  fail: { label: '不在報告', icon: 'alert-circle-outline' },
  match: { label: '代理人を探す', icon: 'people-outline' },
  scan: { label: '代理人QRを読む', icon: 'scan-outline' },
};

function ActionButton({
  action,
  busy,
  onPress,
}: {
  action: DriverAction;
  busy: boolean;
  onPress: () => void;
}) {
  const meta = ACTION_META[action];
  // start / fail のみ非同期処理を伴うため busy 中は無効化＆spinner 表示。
  const showSpinner = busy && (action === 'start' || action === 'fail');
  return (
    <TouchableOpacity
      style={[styles.actionButton, busy && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={busy}
    >
      {showSpinner ? (
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <>
          <Ionicons name={meta.icon} size={16} color={colors.white} />
          <Text style={styles.actionButtonText}>{meta.label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  signOutButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  signOutText: { fontSize: 13, fontWeight: '600', color: colors.gray },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingVertical: 10,
    borderRadius: radius.button,
    backgroundColor: colors.driver,
    ...cardShadow,
  },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: { fontSize: 13, fontWeight: '600', color: colors.white },
});
