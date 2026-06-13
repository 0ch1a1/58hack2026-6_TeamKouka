import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card, PrimaryButton } from '../../../components/ui';
import { isStoredAtAgent } from '../../../lib/status';
import {
  matchNearbyAgent,
  assignAgentToParcel,
  subscribeParcel,
  fetchParcel,
} from '../../../features/parcels';
import {
  recommendAgents,
  markRecommendationChosen,
  isRecommendationEnabled,
  type RecommendedAgent,
} from '../../../features/recommend';

// 候補探索の半径。実機 GPS 誤差で「見つからない」事故を避けるため広めに取る（既存の自動マッチと同値）。
const SEARCH_RADIUS_M = 5000;

// スコア内訳バーの表示順とラベル。breakdown のキーはモデル次第で増減するが、
// 既知キーをこの順で表示し、未知キーは無視する（recommendation-api.md §4 の特徴量に対応）。
const BREAKDOWN_LABELS: { key: string; label: string }[] = [
  { key: 'distance_score', label: '近さ' },
  { key: 'time_score', label: '受取時間' },
  { key: 'day_match', label: '曜日' },
  { key: 'experience', label: '実績' },
  { key: 'level_score', label: '信頼度' },
  { key: 'capacity_score', label: '余裕' },
];

type Mode = 'loading' | 'select' | 'waiting';

export default function MatchingScreen() {
  const { parcelId, trackingNumber } = useLocalSearchParams<{
    parcelId: string;
    trackingNumber: string;
  }>();

  const [mode, setMode] = useState<Mode>('loading');
  const [candidates, setCandidates] = useState<RecommendedAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  // 購読解除関数。select→waiting で後から張るため ref で保持し、unmount 時に確実に解除する。
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  // 代理人が保管状態（delivered_to_agent）になったら pickup-ready へ遷移
  const checkAndNavigate = useCallback(async () => {
    if (!parcelId) return;
    try {
      const parcel = await fetchParcel(parcelId);
      if (!cancelledRef.current && parcel && isStoredAtAgent(parcel.status)) {
        router.replace({ pathname: '/(app)/recipient/pickup-ready', params: { parcelId } });
      }
    } catch {
      // 状態取得に失敗しても待機画面は維持する（次の更新で再試行）
    }
  }, [parcelId]);

  // 保管状態への遷移を購読し、待機モードへ。割り当て確定後・自動マッチ後の共通処理。
  const beginWaiting = useCallback(() => {
    if (cancelledRef.current || !parcelId) return;
    setMode('waiting');
    unsubscribeRef.current = subscribeParcel(parcelId, () => {
      void checkAndNavigate();
    });
    // 既に保管状態の可能性に備えて初回チェック
    void checkAndNavigate();
  }, [parcelId, checkAndNavigate]);

  // 推薦が使えない／失敗した場合の従来どおりの自動マッチ。
  const fallbackAutoMatch = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        await matchNearbyAgent({ parcelId: parcelId!, latitude, longitude, radiusMeters: SEARCH_RADIUS_M });
      } catch {
        Alert.alert('エラー', '代理人の手配に失敗しました。しばらくしてからもう一度お試しください。');
        return;
      }
      beginWaiting();
    },
    [parcelId, beginWaiting],
  );

  useEffect(() => {
    cancelledRef.current = false;

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

    const stopDots = () => { a1.stop(); a2.stop(); a3.stop(); };

    if (!parcelId) {
      return () => stopDots();
    }

    const start = async () => {
      // 1. 受取人の現在地を取得（権限拒否時は待機画面のまま・クラッシュさせない）
      let position: Location.LocationObject;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('位置情報の許可が必要です', '近くの代理人を探すために位置情報の利用を許可してください。');
          return;
        }
        position = await Location.getCurrentPositionAsync({});
      } catch {
        Alert.alert('エラー', '現在地の取得に失敗しました。位置情報を有効にしてからお試しください。');
        return;
      }
      if (cancelledRef.current) return;

      const { latitude, longitude } = position.coords;

      // 2. 推薦サービスが使えるなら候補をスコア順で取得 → 選択 UI。
      //    未設定・失敗・候補ゼロ時は従来の自動マッチへフォールバック。
      if (!isRecommendationEnabled()) {
        await fallbackAutoMatch(latitude, longitude);
        return;
      }

      try {
        const agents = await recommendAgents({
          parcelId,
          latitude,
          longitude,
          radiusMeters: SEARCH_RADIUS_M,
          topK: 8,
        });
        if (cancelledRef.current) return;
        if (agents.length === 0) {
          // 圏内に候補なし → 自動マッチも空振りする可能性が高いが、従来挙動に委ねる
          await fallbackAutoMatch(latitude, longitude);
          return;
        }
        setCandidates(agents);
        setSelectedId(agents[0]?.agent_id ?? null);
        setMode('select');
      } catch {
        // サービス障害時はデモを止めないため自動マッチへ
        await fallbackAutoMatch(latitude, longitude);
      }
    };

    void start();

    return () => {
      cancelledRef.current = true;
      if (unsubscribeRef.current) unsubscribeRef.current();
      stopDots();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelId]);

  const handleConfirm = async () => {
    if (!parcelId || !selectedId || assigning) return;
    const chosen = candidates.find((c) => c.agent_id === selectedId);
    if (!chosen) return;

    setAssigning(true);
    try {
      await assignAgentToParcel({
        parcelId,
        agentId: chosen.agent_id,
        distanceMeters: chosen.distance_meters,
      });
    } catch {
      setAssigning(false);
      Alert.alert('エラー', '代理人の確定に失敗しました。もう一度お試しください。');
      return;
    }

    // 選択ラベルの記録は再学習用の付帯処理。失敗しても確定フローは止めない。
    try {
      await markRecommendationChosen(parcelId, chosen.agent_id);
    } catch {
      // ログ更新失敗は無視（推薦ログが無い／RLS 等。割り当て自体は成功済み）
    }

    setAssigning(false);
    beginWaiting();
  };

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot,
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
  });

  // ===== 選択 UI（推薦サービスが候補を返したとき）=====
  if (mode === 'select') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="代理人を選ぶ" />
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.selectIntro}>
            おすすめ順に表示しています。{'\n'}預ける代理人を選んでください。
          </Text>
          {candidates.map((agent) => (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              selected={agent.agent_id === selectedId}
              onSelect={() => setSelectedId(agent.agent_id)}
            />
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton
            label="この代理人に預ける"
            icon="checkmark-circle-outline"
            onPress={handleConfirm}
            loading={assigning}
            disabled={!selectedId}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ===== 待機 / ローディング（自動マッチ・割り当て後）=====
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="マッチング中" />

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="people-outline" size={64} color={colors.green} />
        </View>

        <Text style={styles.title}>
          {mode === 'loading' ? '近くの代理人を探しています' : '代理人を手配しています'}
        </Text>
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

// 候補1件のカード。スコア順・選択状態・内訳バー・理由を表示。
function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: RecommendedAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  const distanceLabel =
    agent.distance_meters >= 1000
      ? `${(agent.distance_meters / 1000).toFixed(1)}km`
      : `${Math.round(agent.distance_meters)}m`;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onSelect}>
      <Card style={[styles.agentCard, selected && styles.agentCardSelected]}>
        <View style={styles.agentHeader}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{agent.rank}</Text>
          </View>
          <View style={styles.agentNameWrap}>
            <Text style={styles.agentName}>{agent.full_name ?? '代理人'}</Text>
            <View style={styles.agentMetaRow}>
              <Ionicons name="walk-outline" size={13} color={colors.gray} />
              <Text style={styles.agentMeta}>{distanceLabel}</Text>
            </View>
          </View>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={selected ? colors.green : colors.grayLight}
          />
        </View>

        {/* スコア内訳バー */}
        <View style={styles.breakdown}>
          {BREAKDOWN_LABELS.filter(({ key }) => agent.breakdown[key] != null).map(({ key, label }) => {
            const value = Math.max(0, Math.min(1, agent.breakdown[key]));
            return (
              <View key={key} style={styles.barRow}>
                <Text style={styles.barLabel}>{label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${value * 100}%` }]} />
                </View>
              </View>
            );
          })}
        </View>

        {/* 理由タグ */}
        {agent.reasons.length > 0 && (
          <View style={styles.reasons}>
            {agent.reasons.map((reason, i) => (
              <View key={i} style={styles.reasonChip}>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </TouchableOpacity>
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

  // 選択 UI
  listContent: { padding: 16, paddingBottom: 24, gap: 12 },
  selectIntro: { fontSize: 14, color: colors.gray, lineHeight: 22, marginBottom: 4 },
  agentCard: { gap: 12, borderWidth: 2, borderColor: 'transparent' },
  agentCardSelected: { borderColor: colors.green },
  agentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 14, fontWeight: '700', color: colors.green },
  agentNameWrap: { flex: 1, gap: 2 },
  agentName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  agentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  agentMeta: { fontSize: 13, color: colors.gray },
  breakdown: { gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 12, color: colors.gray, width: 56 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.fieldBg, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.green },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: { backgroundColor: colors.greenPale, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  reasonText: { fontSize: 12, fontWeight: '600', color: colors.green },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
