import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors, cardShadow, radius, spacing } from '../../lib/theme';
import { ScreenHeader, Card, EmptyState } from '../../components/ui';
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeNotifications,
  type AppNotification,
} from '../../features/notifications';

// 種別フィルタのタブ。'all' は全件、それ以外は notification_type で絞る（クライアント側 filter）。
type FilterKey = 'all' | string;

const FIXED_FILTERS: { key: FilterKey; label: string }[] = [{ key: 'all', label: 'すべて' }];

// notification_type → 日本語ラベル（未知の type はそのまま表示）。
const TYPE_LABEL: Record<string, string> = {
  parcel_status: 'ステータス',
  agent_assigned: '受取スポット',
  delivery_failed: '不在',
  handed_to_recipient: '受け渡し',
  completed: '完了',
};

function typeLabel(type: string) {
  return TYPE_LABEL[type] ?? type;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const mountedRef = useRef(true);
  const userIdRef = useRef<string | null>(null);
  // 取得のシーケンス番号。古い load の結果が新しい結果を上書きするのを防ぐ。
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const userId = userIdRef.current;
      if (!userId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (mountedRef.current && seq === loadSeqRef.current) setError(true);
          return;
        }
        userIdRef.current = user.id;
      }
      const data = await fetchMyNotifications(userIdRef.current!);
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setItems(data ?? []);
      setError(false);
    } catch {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setError(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      await load();
      if (mountedRef.current) setLoading(false);
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Realtime 購読: user の id が分かってから購読を張る。
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let active = true;
    (async () => {
      let userId = userIdRef.current;
      if (!userId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        userId = user.id;
        userIdRef.current = userId;
      }
      if (!active) return;
      unsubscribe = subscribeNotifications(userId, () => {
        load();
      }, 'list');
    })();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [load]);

  // 種別タブは固定の「すべて」＋ 実データに存在する notification_type から動的生成。
  const filters = useMemo(() => {
    const types = Array.from(new Set(items.map((n) => n.notification_type)));
    return [...FIXED_FILTERS, ...types.map((t) => ({ key: t, label: typeLabel(t) }))];
  }, [items]);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.notification_type === filter)),
    [items, filter],
  );

  const unreadCount = useMemo(() => items.filter((n) => n.read_at === null).length, [items]);

  const handleTapItem = useCallback(async (item: AppNotification) => {
    if (item.read_at !== null) return; // 既読は何もしない
    // 楽観更新。失敗時は load で巻き戻る。
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    try {
      await markNotificationRead(item.id);
    } catch {
      // 失敗時はサーバ状態に同期し直す
      load();
    }
  }, [load]);

  const handleMarkAll = useCallback(async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)));
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    } finally {
      if (mountedRef.current) setMarkingAll(false);
    }
  }, [markingAll, unreadCount, load]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(false);
    await load();
    if (mountedRef.current) setLoading(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="通知" />

      {/* 全て既読ボタン（未読がある時だけ活性） */}
      <View style={styles.actionBar}>
        <Text style={styles.unreadText}>
          {unreadCount > 0 ? `未読 ${unreadCount} 件` : 'すべて既読済み'}
        </Text>
        <TouchableOpacity
          style={[styles.markAllButton, (unreadCount === 0 || markingAll) && styles.markAllDisabled]}
          onPress={handleMarkAll}
          disabled={unreadCount === 0 || markingAll}
          accessibilityLabel="全て既読にする"
        >
          {markingAll ? (
            <ActivityIndicator size="small" color={colors.green} />
          ) : (
            <>
              <Ionicons name="checkmark-done-outline" size={16} color={colors.green} />
              <Text style={styles.markAllText}>全て既読</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 種別フィルタタブ */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        {filters.map((f) => {
          const activeF = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, activeF && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, activeF && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.grayLight} />
          <Text style={styles.errorText}>通知の取得に失敗しました</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const unread = item.read_at === null;
            return (
              <TouchableOpacity activeOpacity={0.7} onPress={() => handleTapItem(item)}>
                <Card style={[styles.itemCard, unread && styles.itemCardUnread]}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTitleRow}>
                      {unread && <View style={styles.unreadDot} />}
                      <Text style={[styles.itemTitle, unread && styles.itemTitleUnread]} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  {!!item.body && <Text style={styles.itemBody}>{item.body}</Text>}
                  <View style={styles.itemFooter}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{typeLabel(item.notification_type)}</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="notifications-off-outline" message="通知はありません" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  unreadText: { fontSize: 13, fontWeight: '600', color: colors.gray },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
    backgroundColor: colors.greenLight,
  },
  markAllDisabled: { opacity: 0.5 },
  markAllText: { fontSize: 13, fontWeight: '600', color: colors.green },
  filterBar: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    height: 32,
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.green },
  filterTextActive: { color: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText: { fontSize: 14, color: colors.gray, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.green,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.button,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: colors.white },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  itemCard: { gap: spacing.sm },
  itemCardUnread: { borderLeftWidth: 3, borderLeftColor: colors.green },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  itemTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, flex: 1 },
  itemTitleUnread: { fontWeight: '700' },
  itemDate: { fontSize: 11, color: colors.grayLight },
  itemBody: { fontSize: 13, color: colors.gray, lineHeight: 18 },
  itemFooter: { flexDirection: 'row' },
  typeBadge: {
    backgroundColor: colors.greenPale,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '600', color: colors.green },
});
