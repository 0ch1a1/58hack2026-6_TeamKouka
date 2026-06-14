import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card, PrimaryButton } from '../../../components/ui';
import { type RecommendedAgent, type ExcludedAgent, type SpotType } from '../../../features/recommend';
import { useMatchingLogic } from './useMatchingLogic';
import { LoadingDots } from './LoadingDots';
import { factorsFromBreakdown, type ScoreFactors } from '../../../lib/scoring';
import { discloseAddress } from '../../../lib/geo';
import { getAgentAvatarUrls } from '../../../features/avatar';
import { Avatar } from '../../../components/Avatar';

const FACTOR_BARS: { key: keyof ScoreFactors; label: string }[] = [
  { key: 'distance',     label: '近さ' },
  { key: 'availability', label: '対応しやすい時間帯' },
  { key: 'reliability',  label: '実績' },
];

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

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '距離不明';
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)}km`
    : `${Math.round(meters)}m`;
}

export default function MatchingScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId: string; trackingNumber: string }>();

  const { mode, candidates, excluded, selectedIds, saving, toggleAgent, moveUp, moveDown, confirmWhitelist } =
    useMatchingLogic(parcelId);

  if (mode === 'select') {
    return (
      <SelectView
        candidates={candidates}
        excluded={excluded}
        selectedIds={selectedIds}
        saving={saving}
        onToggle={toggleAgent}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onConfirm={confirmWhitelist}
      />
    );
  }

  return <LoadingView />;
}

function SelectView({
  candidates,
  excluded,
  selectedIds,
  saving,
  onToggle,
  onMoveUp,
  onMoveDown,
  onConfirm,
}: {
  candidates: RecommendedAgent[];
  excluded: ExcludedAgent[];
  selectedIds: string[];
  saving: boolean;
  onToggle: (agentId: string) => void;
  onMoveUp: (agentId: string) => void;
  onMoveDown: (agentId: string) => void;
  onConfirm: () => void;
}) {
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const ids = candidates.map((c) => c.agent_id);
    if (ids.length === 0) return;
    getAgentAvatarUrls(ids)
      .then((map) => { if (active) setAvatarUrls(map); })
      .catch(() => {});
    return () => { active = false; };
  }, [candidates]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人を選ぶ" />
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.intro}>
          預けてもいい代理人を複数選択してください。{'\n'}
          上にいる代理人ほど配達員に優先的に表示されます。
        </Text>

        {/* 選択中のホワイトリスト（優先度表示）*/}
        {selectedIds.length > 0 && (
          <View style={styles.whitelistSection}>
            <View style={styles.whitelistHeader}>
              <Ionicons name="list-outline" size={16} color={colors.green} />
              <Text style={styles.whitelistTitle}>選択中のホワイトリスト（優先度順）</Text>
            </View>
            {selectedIds.map((id, idx) => {
              const agent = candidates.find((c) => c.agent_id === id);
              if (!agent) return null;
              return (
                <View key={id} style={styles.whitelistRow}>
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityText}>{idx + 1}</Text>
                  </View>
                  <Avatar uri={avatarUrls[id] ?? null} name={agent.full_name} size={28} />
                  <Text style={styles.whitelistName} numberOfLines={1}>
                    {agent.full_name ?? '代理人'}
                  </Text>
                  <View style={styles.orderButtons}>
                    <TouchableOpacity
                      onPress={() => onMoveUp(id)}
                      disabled={idx === 0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={20}
                        color={idx === 0 ? colors.grayLight : colors.green}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onMoveDown(id)}
                      disabled={idx === selectedIds.length - 1}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={idx === selectedIds.length - 1 ? colors.grayLight : colors.green}
                      />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => onToggle(id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={colors.grayLight} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* 候補一覧 */}
        <Text style={styles.sectionLabel}>候補一覧</Text>
        {candidates.map((agent) => {
          const priority = selectedIds.indexOf(agent.agent_id);
          return (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              avatarUrl={avatarUrls[agent.agent_id] ?? null}
              priority={priority >= 0 ? priority + 1 : null}
              onToggle={() => onToggle(agent.agent_id)}
            />
          );
        })}

        {/* 除外された候補（個人NG/満枠/審査外などの理由を開示）。0件なら非表示。 */}
        {excluded.length > 0 && (
          <View style={styles.excludedSection}>
            <Text style={styles.excludedTitle}>除外された候補</Text>
            {excluded.map((item) => (
              <Text key={item.agent_id} style={styles.excludedItem}>
                {(item.full_name ?? '代理人')} ・ {formatDistance(item.distance_meters)} ・ {item.reason}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {saving ? (
          <ActivityIndicator color={colors.green} />
        ) : (
          <PrimaryButton
            label={
              selectedIds.length > 0
                ? `${selectedIds.length}人をホワイトリストに設定する`
                : '代理人を選択してください'
            }
            icon="checkmark-circle-outline"
            onPress={onConfirm}
            disabled={selectedIds.length === 0}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function AgentCard({
  agent,
  avatarUrl,
  priority,
  onToggle,
}: {
  agent: RecommendedAgent;
  avatarUrl: string | null;
  priority: number | null; // null=未選択、数値=優先度（1始まり）
  onToggle: () => void;
}) {
  const selected = priority !== null;
  const distanceLabel = formatDistance(agent.distance_meters);
  const spotLabel = spotTypeLabel(agent.spot_type);

  const factors = factorsFromBreakdown(agent.breakdown);
  const totalScore = Math.round(Math.max(0, Math.min(100, agent.score * 100)));
  const areaLabel = distanceLabel
    ? discloseAddress({ stage: 'before', detailAddress: null, roundedLabel: `${distanceLabel} ほど先のエリア` })
    : null;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
      <Card style={[styles.agentCard, selected && styles.agentCardSelected]}>
        <View style={styles.agentHeader}>
          {/* 選択済みなら優先度バッジ、未選択ならレコメンド順バッジ */}
          {selected ? (
            <View style={styles.priorityBadgeLarge}>
              <Text style={styles.priorityTextLarge}>{priority}</Text>
            </View>
          ) : (
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{agent.rank}</Text>
            </View>
          )}

          <Avatar uri={avatarUrl} name={agent.full_name} size={40} />

          <View style={styles.agentNameWrap}>
            <Text style={styles.agentName}>{agent.full_name ?? '代理人'}</Text>
            {areaLabel && (
              <View style={styles.agentMetaRow}>
                <Ionicons name="location-outline" size={13} color={colors.gray} />
                <Text style={styles.agentMeta}>{areaLabel}</Text>
              </View>
            )}
          </View>

          {totalScore > 0 && (
            <View style={styles.scoreWrap}>
              <Text style={styles.scoreValue}>{totalScore}</Text>
              <Text style={styles.scoreUnit}>点</Text>
            </View>
          )}

          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={26}
            color={selected ? colors.green : colors.grayLight}
          />
        </View>

        {/* 受け渡し先スポット情報（種別バッジ・空き枠・受け取り時間帯）*/}
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

        {/* スコア内訳バー（スコアがある場合のみ） */}
        {agent.score > 0 && (
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
        )}

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

function LoadingView() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人を探しています" />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="people-outline" size={64} color={colors.green} />
        </View>
        <Text style={styles.loadingTitle}>近くの代理人を探しています</Text>
        <LoadingDots />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // ローディング
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 48, gap: 20 },
  iconWrap: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center' },

  // 選択 UI
  listContent: { padding: 16, paddingBottom: 24, gap: 12 },
  intro: { fontSize: 14, color: colors.gray, lineHeight: 22 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.gray, marginTop: 4 },
  excludedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.grayLight,
    gap: 6,
  },
  excludedTitle: { fontSize: 13, fontWeight: '700', color: colors.gray },
  excludedItem: { fontSize: 12, color: colors.grayLight, lineHeight: 18 },

  // ホワイトリストプレビュー
  whitelistSection: { backgroundColor: colors.greenLight, borderRadius: 14, padding: 12, gap: 8 },
  whitelistHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whitelistTitle: { fontSize: 13, fontWeight: '700', color: colors.green },
  whitelistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  whitelistName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  orderButtons: { flexDirection: 'row', gap: 4 },
  priorityBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  priorityText: { fontSize: 12, fontWeight: '800', color: colors.white },

  // 候補カード
  agentCard: { gap: 12, borderWidth: 2, borderColor: 'transparent' },
  agentCardSelected: { borderColor: colors.green },
  agentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 14, fontWeight: '700', color: colors.green },
  priorityBadgeLarge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  priorityTextLarge: { fontSize: 14, fontWeight: '800', color: colors.white },
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
  reasonChip: { backgroundColor: colors.greenPale ?? colors.greenLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  reasonText: { fontSize: 12, fontWeight: '600', color: colors.green },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },

  // 受け渡し先スポット情報
  spotInfo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  spotBadge: { backgroundColor: colors.greenLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  spotBadgeText: { fontSize: 12, fontWeight: '700', color: colors.green },
  spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spotMeta: { fontSize: 12, color: colors.gray },
});
