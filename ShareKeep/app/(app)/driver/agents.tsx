import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
// react-native-maps は default export（MapView）と名前付き export（Marker）を併用。
// 端末/環境によっては地図ネイティブモジュールが無く描画に失敗するため、
// MapView は専用コンポーネントに切り出し、地図が無くてもリストで割り当て可能にする。
import MapView, { Marker } from 'react-native-maps';
import { colors, cardShadow, radius, spacing } from '../../../lib/theme';
import { ScreenHeader, Card, InfoRow, EmptyState } from '../../../components/ui';
import { getAgentLocations, assignAgentToParcel } from '../../../features/parcels';

// getAgentLocations() の戻り要素の型（features/parcels の戻り値を参照）。
type AgentLocation = Awaited<ReturnType<typeof getAgentLocations>>[number];

// 地図初期表示のフォールバック（東京駅周辺）。代理人が居ない/緯度経度が無い時に使う。
const FALLBACK_REGION = {
  latitude: 35.681236,
  longitude: 139.767125,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
} as const;

// available_days(配列) を表示用文字列に。null/空は「指定なし」。
function formatDays(days: string[] | null): string {
  if (!days || days.length === 0) return '指定なし';
  return days.join('・');
}

// start_time〜end_time を表示用に。HH:MM:SS → HH:MM へ丸める。
function formatTimeRange(start: string | null, end: string | null): string {
  const trim = (t: string | null) => (t ? t.slice(0, 5) : null);
  const s = trim(start);
  const e = trim(end);
  if (s && e) return `${s} 〜 ${e}`;
  if (s) return `${s} 〜`;
  if (e) return `〜 ${e}`;
  return '指定なし';
}

// 有効な緯度経度を持つ代理人だけ地図ピンの対象にする。
function hasValidCoords(a: AgentLocation): boolean {
  return (
    typeof a.latitude === 'number' &&
    typeof a.longitude === 'number' &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude)
  );
}

export default function DriverAgentsScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId?: string }>();
  const [agents, setAgents] = useState<AgentLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 地図描画が落ちた場合に true。リスト専用フォールバックに切り替える。
  const [mapFailed, setMapFailed] = useState(false);
  // 二重 router.back を防ぐ（parcelId ガード時）。
  const guarded = useRef(false);

  // parcelId が無ければ割り当て不能。アラート後に戻る。
  useEffect(() => {
    if (!parcelId && !guarded.current) {
      guarded.current = true;
      Alert.alert('エラー', '対象の荷物が指定されていません。', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [parcelId]);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAgentLocations();
      setAgents(data ?? []);
    } catch {
      Alert.alert('エラー', '代理人情報の取得に失敗しました。');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!parcelId) return;
    loadAgents();
  }, [parcelId, loadAgents]);

  // 代理人群の重心。なければ先頭、それも無ければ東京駅フォールバック。
  const initialRegion = (() => {
    const withCoords = agents.filter(hasValidCoords);
    if (withCoords.length === 0) return FALLBACK_REGION;
    const sum = withCoords.reduce(
      (acc, a) => ({ lat: acc.lat + a.latitude, lng: acc.lng + a.longitude }),
      { lat: 0, lng: 0 },
    );
    return {
      latitude: sum.lat / withCoords.length,
      longitude: sum.lng / withCoords.length,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  })();

  const doAssign = useCallback(
    async (agent: AgentLocation) => {
      if (!parcelId) {
        Alert.alert('エラー', '対象の荷物が指定されていません。');
        return;
      }
      try {
        setAssigningId(agent.user_id);
        await assignAgentToParcel({
          parcelId,
          agentId: agent.user_id,
          distanceMeters: null,
        });
        Alert.alert('割り当て完了', `${agent.full_name} さんに割り当てました。`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } catch {
        Alert.alert('エラー', '代理人の割り当てに失敗しました。');
      } finally {
        setAssigningId(null);
      }
    },
    [parcelId],
  );

  // 行/ピンの選択 → 確認ダイアログ → 割り当て。
  const confirmAssign = useCallback(
    (agent: AgentLocation) => {
      setSelectedId(agent.user_id);
      Alert.alert(
        'この代理人に割り当てますか？',
        `${agent.full_name}\n${agent.address}`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '割り当てる', onPress: () => doAssign(agent) },
        ],
      );
    },
    [doAssign],
  );

  const mapAgents = agents.filter(hasValidCoords);

  const renderAgent = ({ item }: { item: AgentLocation }) => {
    const selected = item.user_id === selectedId;
    const busy = assigningId === item.user_id;
    return (
      <Card style={[styles.agentCard, selected && styles.agentCardSelected]}>
        <View style={styles.cardHeader}>
          <View style={styles.nameRow}>
            <Ionicons name="person-circle-outline" size={20} color={colors.driver} />
            <Text style={styles.agentName}>{item.full_name}</Text>
          </View>
          <View style={styles.levelBadge}>
            <Ionicons name="star" size={12} color={colors.driver} />
            <Text style={styles.levelText}>Lv.{item.level}</Text>
          </View>
        </View>

        {/* 個人情報保護: address のみ表示。address_detail（部屋番号等）は割り当て前は出さない。 */}
        <InfoRow label="エリア" value={item.address} />
        <InfoRow label="対応時間" value={formatTimeRange(item.start_time, item.end_time)} />
        <InfoRow label="対応曜日" value={formatDays(item.available_days)} />
        <InfoRow label="実績" value={`完了 ${item.completed_deliveries} 件`} />

        <TouchableOpacity
          style={[styles.assignButton, busy && styles.assignButtonDisabled]}
          onPress={() => confirmAssign(item)}
          disabled={busy || assigningId !== null}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
              <Text style={styles.assignButtonText}>この代理人に割り当てる</Text>
            </>
          )}
        </TouchableOpacity>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人を探す" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.driver} />
        </View>
      ) : agents.length === 0 ? (
        <EmptyState
          icon="people-outline"
          message="対応可能な代理人が見つかりません"
          style={styles.emptyState}
        />
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.user_id}
          renderItem={renderAgent}
          contentContainerStyle={styles.listContent}
          // 地図は補助。地図領域はリストのヘッダーに置き、描画失敗時はリストだけで機能する。
          ListHeaderComponent={
            <View style={styles.mapSection}>
              {!mapFailed && mapAgents.length > 0 ? (
                <MapViewSafe
                  region={initialRegion}
                  agents={mapAgents}
                  selectedId={selectedId}
                  onSelect={confirmAssign}
                  onFail={() => setMapFailed(true)}
                />
              ) : (
                <View style={styles.mapFallback}>
                  <Ionicons name="map-outline" size={28} color={colors.grayLight} />
                  <Text style={styles.mapFallbackText}>
                    地図を表示できません。下のリストから選択してください。
                  </Text>
                </View>
              )}
              <Text style={styles.listHint}>
                ピンまたは下のカードから代理人を選んでください
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// MapView を独立コンポーネントに切り出し、描画系の同期例外で親リストが
// 巻き込まれないようにする。ネイティブモジュール未対応などの例外時は onFail を呼び、
// 親はリスト専用レイアウトへ切り替える（地図はあくまで補助）。
function MapViewSafe({
  region,
  agents,
  selectedId,
  onSelect,
  onFail,
}: {
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  agents: AgentLocation[];
  selectedId: string | null;
  onSelect: (a: AgentLocation) => void;
  onFail: () => void;
}) {
  try {
    return (
      <View style={styles.mapWrap}>
        <MapView style={styles.map} initialRegion={region}>
          {agents.map((a) => (
            <Marker
              key={a.user_id}
              coordinate={{ latitude: a.latitude, longitude: a.longitude }}
              title={a.full_name}
              description={a.address}
              pinColor={a.user_id === selectedId ? '#1A7A4C' : undefined}
              onPress={() => onSelect(a)}
            />
          ))}
        </MapView>
      </View>
    );
  } catch {
    onFail();
    return null;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { paddingTop: 80 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  mapSection: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  mapWrap: {
    height: 240,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...cardShadow,
  },
  map: { flex: 1 },
  mapFallback: {
    height: 120,
    borderRadius: radius.card,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  mapFallbackText: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  listHint: { fontSize: 12, color: colors.gray, paddingHorizontal: spacing.xs },
  agentCard: { gap: spacing.sm },
  agentCardSelected: { borderWidth: 2, borderColor: colors.driver },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  agentName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.fieldBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
  },
  levelText: { fontSize: 12, fontWeight: '600', color: colors.driver },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.driver,
    marginTop: spacing.xs,
  },
  assignButtonDisabled: { opacity: 0.6 },
  assignButtonText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
