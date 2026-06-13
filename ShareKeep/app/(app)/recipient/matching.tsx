import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card } from '../../../components/ui';

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

    const channel = supabase
      .channel(`parcel-matching-${parcelId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'parcels', filter: `id=eq.${parcelId}` },
        (payload) => {
          if (payload.new.status === 'stored') {
            router.replace({ pathname: '/(app)/recipient/pickup-ready', params: { parcelId } });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
