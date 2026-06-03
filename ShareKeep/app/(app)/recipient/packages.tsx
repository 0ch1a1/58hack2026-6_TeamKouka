import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

type PackageStatus = 'waiting' | 'stored' | 'completed';

type Package = {
  id: string;
  name: string;
  trackingNumber: string;
  sender: string;
  expectedDate: string;
  status: PackageStatus;
  agentName?: string;
};

// TODO: Supabase から取得
const MOCK_PACKAGES: Package[] = [
  {
    id: '1',
    name: 'ワイヤレスイヤホン',
    trackingNumber: '1234-5678-9012',
    sender: 'Amazon Japan',
    expectedDate: '2026-06-04',
    status: 'stored',
    agentName: '田中さん',
  },
  {
    id: '2',
    name: 'オーガニックコーヒー豆 200g',
    trackingNumber: '9876-5432-1098',
    sender: '楽天市場',
    expectedDate: '2026-06-05',
    status: 'waiting',
  },
  {
    id: '3',
    name: 'メカニカルキーボード',
    trackingNumber: '1111-2222-3333',
    sender: 'ヨドバシカメラ',
    expectedDate: '2026-05-30',
    status: 'completed',
    agentName: '鈴木さん',
  },
  {
    id: '4',
    name: 'リネンシャツ（Lサイズ）',
    trackingNumber: '4444-5555-6666',
    sender: 'ZOZOTOWN',
    expectedDate: '2026-06-06',
    status: 'waiting',
  },
];

const STATUS_CONFIG: Record<PackageStatus, { label: string; color: string; bg: string; icon: string }> = {
  waiting: { label: '配達待ち', color: '#B45309', bg: '#FEF3C7', icon: 'time-outline' },
  stored:  { label: '保管中',   color: '#1A7A4C', bg: '#D1FAE5', icon: 'home-outline' },
  completed: { label: '受取完了', color: '#6B7280', bg: '#F3F4F6', icon: 'checkmark-circle-outline' },
};

const FILTER_OPTIONS: { key: 'all' | PackageStatus; label: string }[] = [
  { key: 'all',       label: 'すべて' },
  { key: 'waiting',   label: '配達待ち' },
  { key: 'stored',    label: '保管中' },
  { key: 'completed', label: '受取完了' },
];

export default function PackagesScreen() {
  const [filter, setFilter] = useState<'all' | PackageStatus>('all');

  const filtered = filter === 'all'
    ? MOCK_PACKAGES
    : MOCK_PACKAGES.filter(p => p.status === filter);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1A7A4C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>荷物一覧</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
            onPress={() => setFilter(opt.key)}
          >
            <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <PackageCard pkg={item} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>荷物がありません</Text>
          </View>
        }
      />

      <View style={styles.fab}>
        <TouchableOpacity style={styles.fabButton}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
          <Text style={styles.fabText}>荷物を登録</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  const status = STATUS_CONFIG[pkg.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="cube-outline" size={18} color="#1A7A4C" />
          <Text style={styles.cardTitle}>{pkg.name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon as any} size={12} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <Text style={styles.trackingNumber}>追跡番号: {pkg.trackingNumber}</Text>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="storefront-outline" size={14} color="#9CA3AF" />
          <Text style={styles.metaText}>{pkg.sender}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
          <Text style={styles.metaText}>{pkg.expectedDate}</Text>
        </View>
      </View>

      {pkg.agentName && (
        <View style={styles.agentRow}>
          <Ionicons name="person-outline" size={14} color="#1A7A4C" />
          <Text style={styles.agentText}>代理人: {pkg.agentName}</Text>
        </View>
      )}
    </View>
  );
}

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    width: 36,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  filterChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: GREEN,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  trackingNumber: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  agentText: {
    fontSize: 13,
    fontWeight: '600',
    color: GREEN,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GREEN,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
