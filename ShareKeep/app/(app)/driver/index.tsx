import { useState, useEffect, useRef, useCallback } from 'react';
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
import { router, useFocusEffect } from 'expo-router';
import { colors, cardShadow, radius, spacing } from '../../../lib/theme';
import { Card, InfoRow, StatusBadge, EmptyState, QuestStatusBar, ScreenHeader } from '../../../components/ui';
import {
  fetchDriverParcels,
  startDelivery,
  reportDeliveryFailed,
  updateParcelStatus,
  type DriverParcel,
} from '../../../features/parcels';
import { DRIVER_STATUS_LABEL, driverActionsFor, type DriverAction } from '../../../lib/status';
import { DEMO_DELIVERY_COMPANY_ID } from '../../../lib/config';
import { signOut } from '../../../features/auth';
import type { ParcelStatus } from '../../../lib/database.types';
import { NotificationBell } from '../../../components/NotificationBell';
import { logError } from '../../../lib/logger';

// 配達員ホーム＝担当荷物リスト。status に応じたアクションボタンを出す。
// 契約（Wave 0 確定）: fetchDriverParcels / startDelivery / reportDeliveryFailed,
//   DRIVER_STATUS_LABEL / driverActionsFor, DEMO_DELIVERY_COMPANY_ID。
// 遷移: match→/(app)/driver/agents, scan→/(app)/driver/scan（いずれも parcelId 付き）。
export default function DriverHomeScreen() {
  const [parcels, setParcels] = useState<DriverParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // アクション実行中の parcelId。ボタンの spinner 表示に使う（多重防止は inFlightRef）。
  const [busyId, setBusyId] = useState<string | null>(null);

  // アンマウント後の setState ガード。
  const mountedRef = useRef(true);
  // 全アクション共通の同期ロック（start/fail の連打・match/scan の多重 push を防ぐ）。
  const inFlightRef = useRef(false);
  // 取得のシーケンス番号。古い load の結果が新しい結果を上書きするのを防ぐ。
  const loadSeqRef = useRef(0);
  // 初回 focus は useEffect 側の初期ロードに任せ、二重取得を避ける。
  const firstFocusRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const data = await fetchDriverParcels(DEMO_DELIVERY_COMPANY_ID);
      if (!mountedRef.current || seq !== loadSeqRef.current) return; // 古い/解放後は捨てる
      setParcels(data);
      setError(false);
    } catch (error) {
      logError('driver/index:loadParcels', error);
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setError(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      if (mountedRef.current) setLoading(false);
    })();
  }, [load]);

  // 画面が focus する度に: ナビゲーションロックを解放 + 2回目以降は再取得。
  // agents（割り当て）/ scan（受け渡し）から戻った時に最新 status を反映する。
  useFocusEffect(
    useCallback(() => {
      inFlightRef.current = false;
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(false);
    await load();
    if (mountedRef.current) setLoading(false);
  }, [load]);

  // start / fail はその場でステータス更新→一覧再取得。match / scan は別画面へ遷移。
  const handleAction = useCallback(
    async (action: DriverAction, parcel: DriverParcel) => {
      if (inFlightRef.current) return; // 同期ロック（最優先）
      inFlightRef.current = true;

      if (action === 'match') {
        router.push({ pathname: '/(app)/driver/agents', params: { parcelId: parcel.id } });
        return; // ロックは focus 復帰時に解放
      }
      if (action === 'scan') {
        router.push({ pathname: '/(app)/driver/scan', params: { parcelId: parcel.id } });
        return; // ロックは focus 復帰時に解放
      }

      setBusyId(parcel.id);
      try {
        if (action === 'start') {
          await startDelivery(parcel.id);
        } else {
          await reportDeliveryFailed(parcel.id);
        }
        await load();
      } catch (error) {
        logError(`driver/index:handleAction:${action}`, error);
        Alert.alert('エラー', action === 'start' ? '配達開始に失敗しました。' : '不在報告に失敗しました。');
      } finally {
        if (mountedRef.current) setBusyId(null);
        inFlightRef.current = false; // 非遷移アクションはここで解放
      }
    },
    [load],
  );

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      logError('driver/index:handleSignOut', error);
      Alert.alert('エラー', 'ログアウトに失敗しました。');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="配達員ホーム" />
      <View style={styles.headerActions}>
        <NotificationBell color={colors.driver} />
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton} accessibilityLabel="ログアウト">
          <Ionicons name="log-out-outline" size={20} color={colors.gray} />
          <Text style={styles.signOutText}>ログアウト</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.driver} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.grayLight} />
          <Text style={styles.errorText}>荷物一覧の取得に失敗しました</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={parcels.filter(p => p.status !== 'delivered_to_agent')}
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

                  {/* クエスト風の進捗ステップ（表示のみ。バッジは配達員向けの正確な status を維持）。 */}
                  <QuestStatusBar status={item.status} />

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

          {/* デモ用: 受け渡し済み荷物を agent_assigned に戻して再スキャンできるようにする */}
          {parcels.some(p => p.status === 'delivered_to_agent') && (
            <View style={styles.demoSection}>
              <Text style={styles.demoSectionLabel}>デモ操作</Text>
              {parcels
                .filter(p => p.status === 'delivered_to_agent')
                .map(item => {
                  const isBusy = busyId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.demoResetButton, isBusy && styles.demoResetButtonDisabled]}
                      disabled={isBusy}
                      onPress={async () => {
                        if (inFlightRef.current) return;
                        inFlightRef.current = true;
                        setBusyId(item.id);
                        try {
                          await updateParcelStatus(item.id, 'agent_assigned');
                          await load();
                        } catch {
                          Alert.alert('エラー', 'デモリセットに失敗しました。');
                        } finally {
                          if (mountedRef.current) setBusyId(null);
                          inFlightRef.current = false;
                        }
                      }}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color={colors.driver} />
                      ) : (
                        <>
                          <Ionicons name="refresh-outline" size={14} color={colors.driver} />
                          <Text style={styles.demoResetText}>{item.tracking_no} を再スキャン可能に戻す</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>
          )}
        </>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  signOutButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  signOutText: { fontSize: 13, fontWeight: '600', color: colors.gray },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText: { fontSize: 14, color: colors.gray, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.driver,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.button,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: colors.white },
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
  demoSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  demoSectionLabel: { fontSize: 11, fontWeight: '600', color: colors.grayLight, letterSpacing: 0.5 },
  demoResetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.driver,
    borderStyle: 'dashed',
  },
  demoResetButtonDisabled: { opacity: 0.5 },
  demoResetText: { fontSize: 13, fontWeight: '600', color: colors.driver },
});
