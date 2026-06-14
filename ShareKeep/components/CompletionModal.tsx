import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { PrimaryButton, Card } from './ui';
import { RegionalContributionCard } from './RegionalContributionCard';

// 機能② 完了時の達成演出。QRスキャンで parcels.status='completed' 直後に表示する。
// 「あなたの代理受取で再配達1回を防ぎました」を主役に、CO2削減量・獲得XP/ポイントを
// カウントアップ表示し、紙吹雪・フェードで達成感を出す。
//
// 禁止事項に従い reanimated / lottie は使わず React Native 標準の Animated API のみで実装。
type CompletionModalProps = {
  visible: boolean;
  onClose: () => void;
  // CO2削減量(kg)。受取人画面では parcel.co2_saved_kg を渡す。
  co2Saved: number;
  // 獲得XP/ポイント。受取人は付与なしのため省略可（0 のとき非表示）。
  pointsEarned?: number;
};

const { width: SCREEN_W } = Dimensions.get('window');

// useNativeDriver の対象（opacity / transform）と JS駆動の数値カウントアップを分離する。
// カウントアップ用 Animated.Value は addListener で都度 setState して数字を更新する。
function useCountUp(target: number, duration: number, start: boolean) {
  const anim = useRef(new Animated.Value(0)).current;
  const [value, setValue] = useState(0);

  useEffect(() => {
    // 非表示の間は 0 に戻し、再表示(visible=false→true)でも 0 からカウントアップさせる。
    if (!start) {
      anim.setValue(0);
      setValue(0);
      return;
    }
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => setValue(v));
    Animated.timing(anim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // 数値を JS 側で読むため native driver は使えない
    }).start();
    return () => {
      anim.removeListener(id);
    };
  }, [anim, target, duration, start]);

  return value;
}

// 紙吹雪の1粒。上方から下へ落下＋回転＋フェードアウト。
function ConfettiPiece({ index, play }: { index: number; play: boolean }) {
  const fall = useRef(new Animated.Value(0)).current;
  const palette = [colors.green, colors.greenDark, '#F59E0B', '#3B82F6', '#EF4444'];
  const color = palette[index % palette.length];
  const startX = (index / 12) * SCREEN_W;
  const delay = (index % 6) * 80;

  useEffect(() => {
    if (!play) return;
    fall.setValue(0);
    Animated.timing(fall, {
      toValue: 1,
      duration: 1400,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fall, play, delay]);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-40, 320] });
  const translateX = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [0, index % 2 === 0 ? 30 : -30],
  });
  const rotate = fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });
  const opacity = fall.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        {
          left: startX,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

export function CompletionModal({ visible, onClose, co2Saved, pointsEarned = 0 }: CompletionModalProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      fade.setValue(0);
      scale.setValue(0.8);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, fade, scale]);

  // モーダル表示中のみカウントアップを開始する。
  const co2Display = useCountUp(co2Saved, 1200, visible);
  const pointsDisplay = useCountUp(pointsEarned, 1200, visible);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* 紙吹雪レイヤー（カードより背面） */}
        {Array.from({ length: 12 }).map((_, i) => (
          <ConfettiPiece key={i} index={i} play={visible} />
        ))}

        <Animated.View style={[styles.cardWrap, { opacity: fade, transform: [{ scale }] }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={44} color="#FFFFFF" />
            </View>

            <Text style={styles.title}>クエストクリア！</Text>
            <Text style={styles.hero}>あなたの代理受取で{'\n'}再配達1回を防ぎました</Text>

            <Card style={styles.statCard}>
              <View style={styles.statRow}>
                <Ionicons name="leaf" size={28} color={colors.green} />
                <View style={styles.statText}>
                  <Text style={styles.statValue}>{co2Display.toFixed(2)} kg</Text>
                  <Text style={styles.statLabel}>CO2削減への貢献</Text>
                </View>
              </View>

              {pointsEarned > 0 && (
                <View style={styles.statRow}>
                  <Ionicons name="star" size={28} color="#F59E0B" />
                  <View style={styles.statText}>
                    <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                      +{Math.round(pointsDisplay)} XP
                    </Text>
                    <Text style={styles.statLabel}>獲得ポイント</Text>
                  </View>
                </View>
              )}
            </Card>

            {/* 精算状況（静的表示・MVP）。モーダルは即表示→ホーム遷移するため、
                完了画面本体だけでなくここにも pending を出す。実テーブルは未接続。
                受取人視点のため、スポット報酬は代理受取スポット側へ付与予定である旨を示す。 */}
            <Card style={styles.statCard}>
              <View style={styles.settleRow}>
                <View style={styles.settleLabelWrap}>
                  <Ionicons name="business-outline" size={20} color={colors.gray} />
                  <Text style={styles.settleLabel}>配送会社請求</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>pending</Text>
                </View>
              </View>
              <View style={styles.settleRow}>
                <View style={styles.settleLabelWrap}>
                  <Ionicons name="gift-outline" size={20} color={colors.gray} />
                  <Text style={styles.settleLabel}>スポット報酬</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>pending</Text>
                </View>
              </View>
              <Text style={styles.settleNote}>
                スポット報酬は代理受取スポット側へ付与予定です。
              </Text>
            </Card>

            <RegionalContributionCard style={styles.regionalCard} />

            <PrimaryButton label="閉じる" icon="home-outline" onPress={onClose} style={styles.button} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  confetti: {
    position: 'absolute',
    top: 0,
    width: 10,
    height: 14,
    borderRadius: 2,
  },
  cardWrap: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.bg,
    borderRadius: 24,
    overflow: 'hidden',
  },
  scroll: { padding: 24, gap: 16, alignItems: 'center' },
  checkCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  hero: { fontSize: 16, fontWeight: '600', color: colors.greenDark, textAlign: 'center', lineHeight: 24 },
  statCard: { width: '100%', gap: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statText: { gap: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.green },
  statLabel: { fontSize: 13, color: colors.gray },
  // 精算状況（静的表示）
  settleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  settleLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settleLabel: { fontSize: 15, color: colors.ink },
  pendingBadge: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  pendingBadgeText: { fontSize: 13, fontWeight: '700', color: colors.gray },
  settleNote: { fontSize: 12, color: colors.gray, lineHeight: 18 },
  regionalCard: { width: '100%' },
  button: { width: '100%', marginTop: 4 },
});
