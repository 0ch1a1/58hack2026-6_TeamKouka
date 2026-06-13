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
import { type RecommendedAgent } from '../../../features/recommend';
import { useMatchingLogic } from './useMatchingLogic';
import { LoadingDots } from './LoadingDots';

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

export default function MatchingScreen() {
  const { parcelId, trackingNumber } = useLocalSearchParams<{
    parcelId: string;
    trackingNumber: string;
  }>();

  const { mode, candidates, selectedId, assigning, selectAgent, confirmSelection } =
    useMatchingLogic(parcelId);

  // ===== 選択 UI（推薦サービスが候補を返したとき）=====
  if (mode === 'select') {
    return (
      <SelectView
        candidates={candidates}
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
  selectedId,
  assigning,
  onSelect,
  onConfirm,
}: {
  candidates: RecommendedAgent[];
  selectedId: string | null;
  assigning: boolean;
  onSelect: (agentId: string) => void;
  onConfirm: () => void;
}) {
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
            onSelect={() => onSelect(agent.agent_id)}
          />
        ))}
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
