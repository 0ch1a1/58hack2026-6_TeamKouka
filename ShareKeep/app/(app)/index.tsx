import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import TreeScene from '../../components/TreeScene';

type Mode = 'recipient' | 'agent';

// XP からステージを算出（後でSupabaseのuser.xpと接続）
function xpToStage(xp: number): number {
  if (xp < 100) return 0;
  if (xp < 300) return 1;
  if (xp < 600) return 2;
  if (xp < 1000) return 3;
  return 4;
}

const STAGE_LABELS = ['芽吹き', '若木', '成木', '大木', '実りの木'];

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>('recipient');

  // TODO: Supabase から取得した xp・points に差し替え
  const xp = 0;
  const points = 0;
  const stage = xpToStage(xp);

  return (
    <SafeAreaView style={styles.safe}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.appNameRow}>
          <Ionicons name="leaf" size={22} color="#1A7A4C" />
          <Text style={styles.appName}> ShareKeep</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>XP {xp}</Text>
          <Text style={styles.statDivider}>|</Text>
          <Text style={styles.statText}>P {points}</Text>
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
            <Ionicons name="cube-outline" size={16} color={mode === 'recipient' ? '#FFFFFF' : '#1A7A4C'} />
            <Text style={[styles.tabText, mode === 'recipient' && styles.tabTextActive]}> 受取モード</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'agent' && styles.tabActive]}
          onPress={() => setMode('agent')}
        >
          <View style={styles.tabInner}>
            <Ionicons name="home-outline" size={16} color={mode === 'agent' ? '#FFFFFF' : '#1A7A4C'} />
            <Text style={[styles.tabText, mode === 'agent' && styles.tabTextActive]}> 代理モード</Text>
          </View>
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
    <View style={styles.contentCard}>
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
    </View>
  );
}

function AgentContent() {
  return (
    <View style={styles.contentCard}>
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
    </View>
  );
}

const GREEN = '#1A7A4C';
const GREEN_LIGHT = '#D1FAE5';
const BG = '#F0FAF4';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
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
    color: GREEN,
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
    color: GREEN,
  },
  statDivider: {
    color: '#A7F3D0',
  },
  stageLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: GREEN,
    marginTop: 4,
    letterSpacing: 1,
  },
  treeContainer: {
    height: 280,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E8F5E9',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: GREEN_LIGHT,
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
    backgroundColor: GREEN,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: GREEN,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  modeContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
    backgroundColor: GREEN,
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
