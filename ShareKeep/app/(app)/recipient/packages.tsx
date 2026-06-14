import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { toUIStatus, questStatusMeta, type UIStatus } from '../../../lib/status';
import { createParcel, fetchMyParcels } from '../../../features/parcels';
import { DEMO_DELIVERY_COMPANY_ID } from '../../../lib/config';
import { colors } from '../../../lib/theme';
import { ScreenHeader, StatusBadge, QuestStatusBar } from '../../../components/ui';
import { StorageDeadlineBadge } from '../../../components/StorageDeadlineBadge';

type Package = {
  id: string;
  trackingNumber: string;
  sender: string;
  status: UIStatus;
  // クエスト風表示（バッジ文言・ステップバー）に使う生 ParcelStatus。
  // 内部ロジックは引き続き 3 状態集約の status を使う。
  rawStatus: string | null;
  // 機能6: 保管期限（保管中の荷物のみ値が入る）。null=未設定。
  deadlineAt: string | null;
  agentName?: string;
};

// バッジ背景色は従来の 3 状態トーンを踏襲（クエスト文言はバッジ内テキストで表現）。
const STATUS_BADGE_BG: Record<UIStatus, string> = {
  waiting:   '#FEF3C7',
  stored:    '#D1FAE5',
  completed: '#F3F4F6',
};

const FILTER_OPTIONS: { key: 'all' | UIStatus; label: string }[] = [
  { key: 'all',       label: 'すべて' },
  { key: 'waiting',   label: '配達待ち' },
  { key: 'stored',    label: '保管中' },
  { key: 'completed', label: '受取完了' },
];

export default function PackagesScreen() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [filter, setFilter] = useState<'all' | UIStatus>('all');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [registering, setRegistering] = useState(false);

  const fetchPackages = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const data = await fetchMyParcels(user.id);

      const mapped: Package[] = (data ?? []).map((p) => ({
        id: p.id,
        trackingNumber: p.tracking_no,
        sender: p.delivery_companies?.name ?? '不明',
        status: toUIStatus(p.status),
        rawStatus: p.status ?? null,
        deadlineAt: p.storage_deadline_at ?? null,
        agentName: p.assigned_agent?.full_name ?? undefined,
      }));

      setPackages(mapped);
      setLoading(false);
    } catch {
      Alert.alert('エラー', '荷物の取得に失敗しました。');
      return;
    }
  }, []);

  useEffect(() => {
    fetchPackages();

    const channel = supabase
      .channel('parcels-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, () => {
        fetchPackages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPackages]);

  const handleRegister = async () => {
    // 受付番号は create_parcel RPC がサーバ側で自動採番するため、
    // 伝票番号は任意入力（必須バリデーションなし）。入力値は送信しない。
    setRegistering(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRegistering(false);
      return;
    }

    try {
      await createParcel({
        recipientId: user.id,
        deliveryCompanyId: DEMO_DELIVERY_COMPANY_ID,
      });
    } catch {
      setRegistering(false);
      Alert.alert('エラー', '荷物の登録に失敗しました。');
      return;
    }

    setRegistering(false);
    setTrackingInput('');
    setModalVisible(false);
    fetchPackages();
  };

  const filtered = filter === 'all' ? packages : packages.filter(p => p.status === filter);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="荷物一覧" />

      <TouchableOpacity
        style={styles.homeAddressRow}
        onPress={() => router.push('/(app)/recipient/home-address')}
        activeOpacity={0.7}
      >
        <Ionicons name="home-outline" size={16} color={colors.green} />
        <Text style={styles.homeAddressText}>自宅住所を登録 / 編集</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.grayLight} />
      </TouchableOpacity>

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

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <PackageCard pkg={item} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color={colors.grayLight} />
              <Text style={styles.emptyText}>荷物がありません</Text>
            </View>
          }
        />
      )}

      <View style={styles.fab}>
        <TouchableOpacity style={styles.fabButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={28} color={colors.white} />
          <Text style={styles.fabText}>荷物を登録</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>荷物を登録</Text>
            <Text style={styles.modalLabel}>伝票番号（任意）</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例: 1234-5678-9012"
              placeholderTextColor={colors.grayLight}
              value={trackingInput}
              onChangeText={setTrackingInput}
              autoCapitalize="none"
            />
            <Text style={styles.modalHint}>※ 受付番号は登録時に自動で採番されます。</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setModalVisible(false); setTrackingInput(''); }}
              >
                <Text style={styles.modalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleRegister} disabled={registering}>
                {registering ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>登録する</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  // クエスト風メタ（文言/アイコン/色）を生 status から解決。バッジ背景は 3 状態トーンを維持。
  const quest = questStatusMeta(pkg.rawStatus);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        if (pkg.status === 'waiting') {
          router.push({ pathname: '/(app)/recipient/matching', params: { parcelId: pkg.id, trackingNumber: pkg.trackingNumber } });
        } else if (pkg.status === 'stored') {
          router.push({ pathname: '/(app)/recipient/pickup-ready', params: { parcelId: pkg.id } });
        }
      }}
      activeOpacity={pkg.status === 'completed' ? 1 : 0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="cube-outline" size={18} color={colors.green} />
          <Text style={styles.cardTitle}>{pkg.trackingNumber}</Text>
        </View>
        <StatusBadge label={quest.label} color={quest.color} bg={STATUS_BADGE_BG[pkg.status]} icon={quest.icon} />
      </View>

      <QuestStatusBar status={pkg.rawStatus} />

      {/* 機能6: 保管中は保管期限を表示（当日中/残りわずか/期限超過） */}
      {pkg.status === 'stored' && <StorageDeadlineBadge deadlineAt={pkg.deadlineAt} />}

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="storefront-outline" size={14} color={colors.grayLight} />
          <Text style={styles.metaText}>{pkg.sender}</Text>
        </View>
      </View>

      {pkg.agentName && (
        <View style={styles.agentRow}>
          <Ionicons name="person-outline" size={14} color={colors.green} />
          <Text style={styles.agentText}>代理受取スポット: {pkg.agentName}</Text>
        </View>
      )}

      {/* 機能9: 追記専用監査ログの検証画面への導線 */}
      <TouchableOpacity
        style={styles.auditLogRow}
        onPress={() =>
          router.push({ pathname: '/(app)/recipient/audit-log', params: { parcelId: pkg.id } })
        }
        activeOpacity={0.7}
      >
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.green} />
        <Text style={styles.auditLogText}>監査ログを検証</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.grayLight} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  homeAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  homeAddressText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.green },
  filterChipTextActive: { color: colors.white },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, gap: 12 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  cardMeta: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: colors.gray },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  agentText: { fontSize: 13, fontWeight: '600', color: colors.green },
  auditLogRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  auditLogText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.green },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: colors.grayLight },
  fab: { position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' },
  fabButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.green, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: colors.gray },
  modalHint: { fontSize: 12, color: colors.grayLight, marginTop: -4 },
  modalInput: { height: 52, backgroundColor: colors.fieldBg, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: colors.border },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalCancel: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.gray },
  modalSubmit: { flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  modalSubmitText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
