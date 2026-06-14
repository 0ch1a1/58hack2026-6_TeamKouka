import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card, PrimaryButton } from '../../../components/ui';
import { type RecommendedAgent, type ExcludedAgent, type SpotType } from '../../../features/recommend';
import { useMatchingLogic } from './useMatchingLogic';
import { LoadingDots } from './LoadingDots';
// 機能④⑤: スコア内訳バーへの集約とプライバシー段階開示の表示ユーティリティ（AgentCard で使用）。
import { factorsFromBreakdown, type ScoreFactors } from '../../../lib/scoring';
import { discloseAddress } from '../../../lib/geo';
// 機能7': 代理人の顔写真（任意・未設定可）。候補カードに信頼シグナルとして表示。
import { getAgentAvatarUrls } from '../../../features/avatar';
import { Avatar } from '../../../components/Avatar';

// 因子バーの表示定義。feature-ideas.md「スコア関数の定義」の 3 因子（時間帯 T / 距離 D / 実績 R）に対応。
// recommendation-api の breakdown（多数の特徴量）は factorsFromBreakdown でこの 3 因子に集約する。
// 断定表現は禁止（「対応しやすい」等の柔らかい表現に統一）。
const FACTOR_BARS: { key: keyof ScoreFactors; label: string }[] = [
  { key: 'distance', label: '近さ' },
  { key: 'availability', label: '対応しやすい時間帯' },
  { key: 'reliability', label: '実績' },
];

// 受け渡し先スポット種別 → 日本語ラベル。旧 API で spot_type が欠落した場合は null（バッジ非表示）。
const SPOT_TYPE_LABELS: Record<SpotType, string> = {
  store: '店舗',
  facility: '施設',
  manager_room: '管理人室',
  individual: '個人',
};

function spotTypeLabel(spotType: SpotType | undefined): string | null {
  if (!spotType) return null;
  return SPOT_TYPE_LABELS[spotType] ?? null;
}

// 距離（メートル）を「150m」「1.2km」形式に整形。カードと除外セクションで共用。
function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)}km`
    : `${Math.round(meters)}m`;
}

export default function MatchingScreen() {
  const { parcelId, trackingNumber } = useLocalSearchParams<{
    parcelId: string;
    trackingNumber: string;
  }>();

  const { mode, candidates, excluded, selectedId, assigning, selectAgent, confirmSelection } =
    useMatchingLogic(parcelId);

  // ===== 選択 UI（推薦サービスが候補を返したとき）=====
  if (mode === 'select') {
    return (
      <SelectView
        candidates={candidates}
        excluded={excluded}
        selectedId={selectedId}
        assigning={assigning}
        onSelect={selectAgent}
        onConfirm={confirmSelection}
      />
    );
  }

  // ===== 待機 / ローディング（自動マッチ・割り当て後）=====
  return <WaitingView mode={mode} trackingNumber={trackingNumber} />;
}

// 候補をスコア順に並べて選んでもらう画面。
function SelectView({
  candidates,
  excluded,
  selectedId,
  assigning,
  onSelect,
  onConfirm,
}: {
  candidates: RecommendedAgent[];
  excluded: ExcludedAgent[];
  selectedId: string | null;
  assigning: boolean;
  onSelect: (agentId: string) => void;
  onConfirm: () => void;
}) {
  // 機能7': 候補代理人の顔写真（署名URL）を一括取得。未設定の代理人は含まれない。
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const ids = candidates.map((c) => c.agent_id);
    if (ids.length === 0) return;
    getAgentAvatarUrls(ids)
      .then((map) => { if (active) setAvatarUrls(map); })
      .catch(() => { /* 取得失敗時はプレースホルダ表示で継続 */ });
    return () => { active = false; };
  }, [candidates]);

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
            avatarUrl={avatarUrls[agent.agent_id] ?? null}
            selected={agent.agent_id === selectedId}
            onSelect={() => onSelect(agent.agent_id)}
          />
        ))}

        {/* 除外された候補（フィルタで絞り込まれた理由を開示）。0 件なら非表示。 */}
        {excluded.length > 0 && (
          <View style={styles.excludedSection}>
            <Text style={styles.excludedTitle}>除外された候補</Text>
            {excluded.map((item) => (
              <Text key={item.agent_id} style={styles.excludedItem}>
                {item.full_name} ・ {formatDistance(item.distance_meters)} ・ {item.reason}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label="この代理人に預ける"
          icon="checkmark-circle-outline"
          onPress={onConfirm}
          loading={assigning}
          disabled={!selectedId}
        />
      </View>
    </SafeAreaView>
  );
}

// 自動マッチ中・割り当て後の待機画面。
function WaitingView({
  mode,
  trackingNumber,
}: {
  mode: 'loading' | 'waiting';
  trackingNumber?: string;
}) {
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

        <LoadingDots />

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

// 候補1件のカード。総合スコア・選択状態・3 因子バー（距離/対応時間/実績）・理由を表示。
function AgentCard({
  agent,
  avatarUrl,
  selected,
  onSelect,
}: {
  agent: RecommendedAgent;
  avatarUrl: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const distanceLabel = formatDistance(agent.distance_meters);

  // 受け渡し先スポット種別の日本語ラベル（旧 API で欠落時は null → バッジ非表示）。
  const spotLabel = spotTypeLabel(agent.spot_type);

  // breakdown（特徴量名→0–1）を 3 因子に集約してバー表示（lib/scoring.ts と同じ語彙）。
  const factors = factorsFromBreakdown(agent.breakdown);
  // 総合スコアは推薦サービスの score（0–1 の確率）を 0–100 点に換算して表示。
  // ※ score をそのまま丸めると 0.87 が「1点」になる不具合になるため必ず ×100 する。
  const totalScore = Math.round(Math.max(0, Math.min(100, agent.score * 100)));

  // プライバシー段階開示（確定前）。候補一覧では詳細住所は出さず概略のみ。
  // RecommendedAgent は住所を持たないため roundedLabel は距離ベースの概略にする。
  // k-匿名性は保証しない（lib/geo.ts のコメント参照）。確定後は詳細を別画面で開示。
  const areaLabel = discloseAddress({
    stage: 'before',
    detailAddress: null,
    roundedLabel: `${distanceLabel} ほど先のエリア`,
  });

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onSelect}>
      <Card style={[styles.agentCard, selected && styles.agentCardSelected]}>
        <View style={styles.agentHeader}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{agent.rank}</Text>
          </View>
          {/* 機能7': 代理人の顔写真。未設定なら頭文字プレースホルダ。 */}
          <Avatar uri={avatarUrl} name={agent.full_name} size={40} />
          <View style={styles.agentNameWrap}>
            <Text style={styles.agentName}>{agent.full_name ?? '代理人'}</Text>
            <View style={styles.agentMetaRow}>
              <Ionicons name="location-outline" size={13} color={colors.gray} />
              <Text style={styles.agentMeta}>{areaLabel}</Text>
            </View>
          </View>
          <View style={styles.scoreWrap}>
            <Text style={styles.scoreValue}>{totalScore}</Text>
            <Text style={styles.scoreUnit}>点</Text>
          </View>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={selected ? colors.green : colors.grayLight}
          />
        </View>

        {/* 受け渡し先スポット情報（種別バッジ・空き枠・受け取り時間帯）。拡張前 API では各値が
            欠落しうるため、存在するものだけ描画する。 */}
        {(spotLabel || agent.capacity_label || agent.pickup_window_label) && (
          <View style={styles.spotInfo}>
            {spotLabel && (
              <View style={styles.spotBadge}>
                <Text style={styles.spotBadgeText}>{spotLabel}</Text>
              </View>
            )}
            {agent.capacity_label && (
              <View style={styles.spotMetaRow}>
                <Ionicons name="cube-outline" size={13} color={colors.gray} />
                <Text style={styles.spotMeta}>{agent.capacity_label}</Text>
              </View>
            )}
            {agent.pickup_window_label && (
              <View style={styles.spotMetaRow}>
                <Ionicons name="time-outline" size={13} color={colors.gray} />
                <Text style={styles.spotMeta}>{agent.pickup_window_label}</Text>
              </View>
            )}
          </View>
        )}

        {/* スコア内訳（3 因子の横バー）。断定せず「対応しやすさ」の目安として表示。 */}
        <View style={styles.breakdown}>
          {FACTOR_BARS.map(({ key, label }) => {
            const value = Math.max(0, Math.min(1, factors[key]));
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
  scoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  scoreValue: { fontSize: 20, fontWeight: '800', color: colors.green },
  scoreUnit: { fontSize: 12, color: colors.gray },
  breakdown: { gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 12, color: colors.gray, width: 56 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.fieldBg, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.green },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: { backgroundColor: colors.greenPale, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  reasonText: { fontSize: 12, fontWeight: '600', color: colors.green },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },

  // 受け渡し先スポット情報（種別バッジ＋空き枠＋受け取り時間帯）
  spotInfo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  spotBadge: { backgroundColor: colors.greenLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  spotBadgeText: { fontSize: 12, fontWeight: '700', color: colors.green },
  spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spotMeta: { fontSize: 12, color: colors.gray },

  // 除外された候補セクション（補足情報として控えめに表示）
  excludedSection: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  excludedTitle: { fontSize: 13, fontWeight: '700', color: colors.grayLight },
  excludedItem: { fontSize: 12, color: colors.grayLight, lineHeight: 18 },
});
