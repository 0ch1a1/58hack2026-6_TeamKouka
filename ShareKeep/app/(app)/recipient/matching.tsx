import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card } from '../../../components/ui';
import { isStoredAtAgent } from '../../../lib/status';
import { matchNearbyAgent, subscribeParcel, fetchParcel } from '../../../features/parcels';

export default function MatchingScreen() {
  const { parcelId, trackingNumber } = useLocalSearchParams<{
    parcelId: string;
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

    if (!parcelId) return () => { a1.stop(); a2.stop(); a3.stop(); };

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // 代理人が保管状態（delivered_to_agent）になったら pickup-ready へ遷移
    const checkAndNavigate = async () => {
      try {
        const parcel = await fetchParcel(parcelId);
        if (!cancelled && parcel && isStoredAtAgent(parcel.status)) {
          router.replace({ pathname: '/(app)/recipient/pickup-ready', params: { parcelId } });
        }
      } catch {
        // 状態取得に失敗してもマッチング待機画面は維持する（次の更新で再試行）
      }
    };

    const start = async () => {
      // 1. 受取人の現在地を取得（権限拒否時は待機画面のまま・クラッシュさせない）
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('位置情報の許可が必要です', '近くの代理人を探すために位置情報の利用を許可してください。');
          return;
        }

        const position = await Location.getCurrentPositionAsync({});
        if (cancelled) return;

        // 2. 現在地で近くの代理人を手配
        await matchNearbyAgent({
          parcelId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        // 手配に失敗した場合は待っても遷移しないため、購読を開始せず終了する。
        Alert.alert('エラー', '代理人の手配に失敗しました。しばらくしてからもう一度お試しください。');
        return;
      }

      if (cancelled) return;

      // 3. 荷物の状態変化を購読し、保管状態になったら次の画面へ
      unsubscribe = subscribeParcel(parcelId, () => {
        void checkAndNavigate();
      });

      // 既に保管状態になっている可能性に備えて初回チェック
      void checkAndNavigate();
    };

    void start();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [parcelId]);

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot,
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="マッチング中" />

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="people-outline" size={64} color={colors.green} />
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

        <Card style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="barcode-outline" size={16} color={colors.green} />
            <Text style={styles.cardLabel}>追跡番号</Text>
            <Text style={styles.cardValue}>{trackingNumber ?? '—'}</Text>
          </View>
        </Card>

        <Text style={styles.note}>
          代理人が決まると自動的に次の画面に進みます。{'\n'}このままお待ちいただくか、アプリを閉じても大丈夫です。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 48, gap: 20 },
  iconWrap: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  desc: { fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', gap: 10, height: 24, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  card: { width: '100%', gap: 0 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 13, color: colors.gray, width: 72 },
  cardValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  note: { fontSize: 13, color: colors.grayLight, textAlign: 'center', lineHeight: 20 },
});
