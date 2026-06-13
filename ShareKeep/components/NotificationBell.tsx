import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { getUnreadNotificationCount, subscribeNotifications } from '../features/notifications';

// ヘッダー右に置くベル＋未読バッジ。タップで通知一覧へ。
// フォーカス復帰時と notifications の Realtime 変化で未読数を更新する。
// アイコン色は呼び出し側（受取人/代理人ホーム=green, 配達員ホーム=driver）から color prop で受け取る。
export function NotificationBell({ color }: { color: string }) {
  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const c = await getUnreadNotificationCount();
      if (mountedRef.current) setCount(c);
    } catch {
      // 取得失敗時はバッジを変えない（前回値を維持）。
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;
      userIdRef.current = user.id;
      refresh();
      unsubscribe = subscribeNotifications(user.id, () => refresh(), 'bell');
    })();
    return () => {
      mountedRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, [refresh]);

  // 通知画面から戻った時などに最新の未読数へ更新。
  useFocusEffect(
    useCallback(() => {
      if (userIdRef.current) refresh();
    }, [refresh]),
  );

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.push('/(app)/notifications')}
      accessibilityLabel={`通知${count > 0 ? `（未読${count}件）` : ''}`}
    >
      <Ionicons name="notifications-outline" size={22} color={color} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
});
