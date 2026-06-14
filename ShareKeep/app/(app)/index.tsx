import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import TreeScene from '../../components/TreeScene';
import { colors } from '../../lib/theme';
import { XP_LEVEL_THRESHOLDS } from '../../lib/constants';
import { Card } from '../../components/ui';
import { RegionalContributionCard } from '../../components/RegionalContributionCard';
import { NotificationBell } from '../../components/NotificationBell';
import { getMyRole } from '../../features/auth';

type Mode = 'recipient' | 'agent';

// XP からステージを算出（後でSupabaseのuser.xpと接続）
// しきい値（XP_LEVEL_THRESHOLDS）未満となる最初の index がステージ。
// いずれも満たさなければ最終ステージ（= しきい値の数）。
function xpToStage(xp: number): number {
  const stage = XP_LEVEL_THRESHOLDS.findIndex((threshold) => xp < threshold);
  return stage === -1 ? XP_LEVEL_THRESHOLDS.length : stage;
}

const STAGE_LABELS = ['芽吹き', '若木', '成木', '大木', '実りの木'];

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>('recipient');
  // ロール判定中は受取人/代理人ホームを描かずスピナーを出す（配達員はここで /driver へ送る）。
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const role = await getMyRole();
        if (active && role === 'delivery_company') {
          router.replace('/(app)/driver');
          return; // 遷移するので roleChecked は立てない（ホームを一瞬も描かない）
        }
      } catch {
        // 取得失敗時は通常ホーム（受取人/代理人）にフォールバック。
      }
      if (active) setRoleChecked(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // TODO: Supabase から取得した xp・points に差し替え
  const xp = 0;
  const points = 0;
  const stage = xpToStage(xp);

  if (!roleChecked) {
    return (
      <SafeAreaView style={[styles.safe, styles.loading]}>
        <ActivityIndicator size="large" color={colors.green} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.appNameRow}>
          <Ionicons name="leaf" size={22} color={colors.green} />
          <Text style={styles.appName}> ShareKeep</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>XP {xp}</Text>
          <Text style={styles.statDivider}>|</Text>
          <Text style={styles.statText}>P {points}</Text>
          <NotificationBell color={colors.green} />
        </View>
      </View>

      {/* 木のステージラベル */}
      <Text style={styles.stageLabel}>{STAGE_LABELS[stage]}</Text>

      {/* 3D木ビジュアル */}
      <View style={styles.treeContainer}>
        <TreeScene stage={stage} />
      </View>

      {/* モード切り替えタブ */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, mode === 'recipient' && styles.tabActive]}
          onPress={() => setMode('recipient')}
        >
          <View style={styles.tabInner}>
            <Ionicons name="cube-outline" size={16} color={mode === 'recipient' ? '#FFFFFF' : colors.green} />
            <Text style={[styles.tabText, mode === 'recipient' && styles.tabTextActive]}> 受取モード</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'agent' && styles.tabActive]}
          onPress={() => setMode('agent')}
        >
          <View style={styles.tabInner}>
            <Ionicons name="home-outline" size={16} color={mode === 'agent' ? '#FFFFFF' : colors.green} />
            <Text style={[styles.tabText, mode === 'agent' && styles.tabTextActive]}> 代理モード</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* 地域貢献カード（機能③・全体集計） */}
      <View style={styles.regionalWrap}>
        <RegionalContributionCard />
      </View>

      <View style={styles.pointExchangeWrap}>
        <TouchableOpacity
          style={styles.pointExchangeButton}
          onPress={() => Alert.alert('開発中です')}
          activeOpacity={0.7}
        >
          <Ionicons name="gift-outline" size={16} color={colors.green} />
          <Text style={styles.pointExchangeText}>ポイントを交換する</Text>
        </TouchableOpacity>
      </View>

      {/* モード別コンテンツ（後続タスクで各画面へ遷移） */}
      <View style={styles.modeContent}>
        {mode === 'recipient' ? (
          <RecipientContent />
        ) : (
          <AgentContent />
        )}
      </View>
    </SafeAreaView>
  );
}

function RecipientContent() {
  return (
    <Card style={styles.contentCard}>
      <Text style={styles.contentTitle}>荷物を受け取る</Text>
      <Text style={styles.contentDesc}>
        不在時の荷物を近所の代理人に一時保管してもらえます。
      </Text>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => router.push('/(app)/recipient/packages')}
      >
        <Text style={styles.actionButtonText}>荷物一覧を見る</Text>
      </TouchableOpacity>
    </Card>
  );
}

function AgentContent() {
  return (
    <Card style={styles.contentCard}>
      <Text style={styles.contentTitle}>代理人として活動する</Text>
      <Text style={styles.contentDesc}>
        近所の荷物を預かってCO2削減に貢献しましょう。
      </Text>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => router.push('/(app)/agent/profile')}
      >
        <Text style={styles.actionButtonText}>プロファイルを設定する</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionButton, { marginTop: 8 }]}
        onPress={() => router.push('/(app)/agent/parcels')}
      >
        <Text style={styles.actionButtonText}>受取対応を確認する</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.green,
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.green,
  },
  statDivider: {
    color: '#A7F3D0',
  },
  stageLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: colors.green,
    marginTop: 4,
    letterSpacing: 1,
  },
  treeContainer: {
    height: 280,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.greenPale,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: colors.greenLight,
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.green,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.green,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  regionalWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  pointExchangeWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  pointExchangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 12,
    paddingVertical: 12,
  },
  pointExchangeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.green,
  },
  modeContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  contentCard: {
    padding: 20,
    gap: 8,
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  contentDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 8,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
