import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

export default function MatchingScreen() {
  const { packageName, trackingNumber } = useLocalSearchParams<{
    packageName: string;
    trackingNumber: string;
  }>();

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.delay(800 - delay),
        ])
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 267);
    const a3 = animate(dot3, 534);
    a1.start();
    a2.start();
    a3.start();

    // TODO: Supabase Realtime でステータスを監視
    // deliveries テーブルの status が 2 になったら受取準備画面へ遷移
    // const channel = supabase
    //   .channel('delivery-status')
    //   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries' }, (payload) => {
    //     if (payload.new.status === 2) {
    //       router.replace('/(app)/recipient/pickup-ready');
    //     }
    //   })
    //   .subscribe();
    // return () => { supabase.removeChannel(channel); a1.stop(); a2.stop(); a3.stop(); };

    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot,
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>マッチング中</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="people-outline" size={64} color={GREEN} />
        </View>

        <Text style={styles.title}>代理人を手配しています</Text>
        <Text style={styles.desc}>
          近くの代理人が見つかり次第、{'\n'}荷物を届けに向かいます。
        </Text>

        <View style={styles.dots}>
          <Animated.View style={[styles.dot, dotStyle(dot1)]} />
          <Animated.View style={[styles.dot, dotStyle(dot2)]} />
          <Animated.View style={[styles.dot, dotStyle(dot3)]} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="cube-outline" size={16} color={GREEN} />
            <Text style={styles.cardLabel}>荷物名</Text>
            <Text style={styles.cardValue}>{packageName ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.cardRow}>
            <Ionicons name="barcode-outline" size={16} color={GREEN} />
            <Text style={styles.cardLabel}>追跡番号</Text>
            <Text style={styles.cardValue}>{trackingNumber ?? '—'}</Text>
          </View>
        </View>

        <Text style={styles.note}>
          代理人が決まるとプッシュ通知でお知らせします。{'\n'}このままお待ちいただくか、アプリを閉じても大丈夫です。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    width: 36,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 20,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  desc: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 10,
    height: 24,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  card: {
    width: '100%',
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: {
    fontSize: 13,
    color: '#6B7280',
    width: 72,
  },
  cardValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  note: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
