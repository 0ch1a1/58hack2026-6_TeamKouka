import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card, StatusBadge, QuestStatusBar } from '../../../components/ui';
import { questStatusMeta } from '../../../lib/status';
import { generateQrToken, verifyRecipientQr, updateParcelStatus } from '../../../features/parcels';

type MatchedParcel = {
  matchId: string;
  parcelId: string;
  trackingNo: string;
  recipientName: string;
  status: string;
  parcelStatus: string | null;
  qrToken: string | null;
};

// delivery_matches の select 結果のうち、map で参照する最小フィールドだけを表す型。
// parcels / profiles の to-one 埋め込みは実行時は単一オブジェクトだが、生成型なしの
// Supabase 推論では配列になり得るため両方を許容する（旧 (m: any) と等価のアクセスを保つ）。
type Embed<T> = T | T[] | null;
type ParcelEmbed = { tracking_no: string | null; status: string | null };
type ProfileEmbed = { full_name: string | null };
type MatchRow = {
  id: string;
  parcel_id: string;
  status: string | null;
  parcels: Embed<ParcelEmbed>;
  profiles: Embed<ProfileEmbed>;
};

// to-one 埋め込みが配列推論された場合に先頭要素を取り出す。実行時は単一オブジェクト
// （Array.isArray=false）なので値をそのまま返し、旧挙動と完全に等価。
const toOne = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default function AgentParcelsScreen() {
  const [parcels, setParcels] = useState<MatchedParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrParcel, setQrParcel] = useState<MatchedParcel | null>(null);
  const [scanParcel, setScanParcel] = useState<MatchedParcel | null>(null);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const fetchParcels = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('delivery_matches')
      .select(`
        id,
        parcel_id,
        status,
        parcels(tracking_no, status),
        profiles!recipient_id(full_name)
      `)
      .eq('agent_id', user.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) { setLoading(false); return; }

    const rows = (data ?? []) as MatchRow[];
    const mapped: MatchedParcel[] = rows.map((m) => {
      const parcel = toOne(m.parcels);
      const profile = toOne(m.profiles);
      return {
        matchId: m.id,
        parcelId: m.parcel_id,
        trackingNo: parcel?.tracking_no ?? '—',
        recipientName: profile?.full_name ?? '不明',
        status: m.status ?? 'matched',
        parcelStatus: parcel?.status ?? null,
        qrToken: null,
      };
    });

    setParcels(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchParcels();

    const channel = supabase
      .channel('agent-matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_matches' }, () => {
        fetchParcels();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchParcels]);

  const handleShowQR = async (parcel: MatchedParcel) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('エラー', 'ユーザー情報を取得できませんでした。');
      return;
    }

    try {
      const token = await generateQrToken({
        parcelId: parcel.parcelId,
        userId: user.id,
        qrType: 'agent',
      });
      setQrParcel({ ...parcel, qrToken: token });
    } catch {
      Alert.alert('エラー', 'QRコードの生成に失敗しました。');
    }
  };

  // 【デモ用フォールバック】配達員から荷物を受領（agent_assigned → delivered_to_agent）。
  // 本来の導線は配達員側の QR スキャン画面（driver/scan.tsx, verify-agent-qr）。
  // それが使えない場面のデモ保険として代理人自身がこの導線でステータスを進める。
  // 受取人側 matching の subscribeParcel が発火し pickup-ready へ進む。副作用（ポイント/CO2）は
  // 後段の verifyRecipientQr で付くため、ここで updateParcelStatus を使っても報酬計算は壊れない（A0 確認済み）。
  const handleReceive = async (parcel: MatchedParcel) => {
    try {
      await updateParcelStatus(parcel.parcelId, 'delivered_to_agent');
      await fetchParcels();
      Alert.alert('受領しました', '荷物を保管中にしました。受取人が受け取りに来られます。');
    } catch {
      Alert.alert('エラー', '受領処理に失敗しました。');
    }
  };

  const handleOpenScanner = async (parcel: MatchedParcel) => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('カメラ権限が必要です', '設定からカメラへのアクセスを許可してください。');
        return;
      }
    }
    setScanned(false);
    setScanParcel(parcel);
  };

  const handleQRScanned = async ({ data }: { data: string }) => {
    if (scanned || !scanParcel) return;
    setScanned(true);
    setScanParcel(null);

    try {
      // 受取人QRを検証。used フラグ更新 / status 遷移 / ポイント / CO2 は
      // verify-recipient-qr Edge Function がサーバ側でトランザクション処理する。
      await verifyRecipientQr(data);
    } catch {
      Alert.alert('エラー', 'QRコードが無効または期限切れです。');
      return;
    }

    Alert.alert('引き渡し完了！', '荷物の引き渡しが完了しました。', [
      { text: 'OK', onPress: () => {
        // 引き渡しはサーバ側（verify-recipient-qr）で完了済み。
        // agent/complete 画面は未実装（B5 スコープ外）のため遷移せず、一覧を再取得して留まる。
        fetchParcels();
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="請負リスト" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : (
        <FlatList
          data={parcels}
          keyExtractor={item => item.matchId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            // クエスト風表示は荷物の生 status（parcelStatus）を基準にする。
            const quest = questStatusMeta(item.parcelStatus);
            return (
            <Card>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="cube-outline" size={16} color={colors.green} />
                  <Text style={styles.cardTitle}>{item.trackingNo}</Text>
                </View>
                <StatusBadge label={quest.label} color={quest.color} bg="#D1FAE5" icon={quest.icon} />
              </View>

              <QuestStatusBar status={item.parcelStatus} />

              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={14} color="#9CA3AF" />
                <Text style={styles.metaText}>受取人: {item.recipientName}</Text>
              </View>

              {item.parcelStatus === 'agent_assigned' ? (
                <TouchableOpacity style={styles.receiveButton} onPress={() => handleReceive(item)}>
                  <Ionicons name="cube" size={16} color="#FFFFFF" />
                  <Text style={styles.receiveButtonText}>デモ用: 受領済みにする</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.qrButton} onPress={() => handleShowQR(item)}>
                    <Ionicons name="qr-code-outline" size={16} color={colors.green} />
                    <Text style={styles.qrButtonText}>配達員用QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.scanButton} onPress={() => handleOpenScanner(item)}>
                    <Ionicons name="scan-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.scanButtonText}>受取人QRスキャン</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={styles.messageButton}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/messages/[parcelId]',
                    params: { parcelId: item.parcelId },
                  })
                }
              >
                <Ionicons name="chatbubbles-outline" size={16} color={colors.green} />
                <Text style={styles.messageButtonText}>メッセージ</Text>
              </TouchableOpacity>
            </Card>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>現在の請負はありません</Text>
            </View>
          }
        />
      )}

      {/* 配達員提示用QRモーダル */}
      <Modal visible={!!qrParcel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>配達員に提示するQR</Text>
            <Text style={styles.modalSub}>{qrParcel?.trackingNo}</Text>
            <View style={styles.qrWrap}>
              {qrParcel?.qrToken && (
                <QRCode value={qrParcel.qrToken} size={200} />
              )}
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setQrParcel(null)}>
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QRスキャナー */}
      <Modal visible={!!scanParcel} animationType="slide">
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleQRScanned}
          />
          <View style={styles.scanOverlay}>
            <Text style={styles.scanText}>受取人のQRコードをスキャン</Text>
            <View style={styles.scanFrame} />
          </View>
          <TouchableOpacity style={styles.cancelScan} onPress={() => setScanParcel(null)}>
            <Text style={styles.cancelScanText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#6B7280' },
  actionRow: { flexDirection: 'row', gap: 8 },
  receiveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.green },
  receiveButtonText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  qrButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.green },
  qrButtonText: { fontSize: 13, fontWeight: '600', color: colors.green },
  scanButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.green },
  scanButtonText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  messageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.green },
  messageButtonText: { fontSize: 13, fontWeight: '600', color: colors.green },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, alignItems: 'center', gap: 12, width: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalSub: { fontSize: 13, color: '#9CA3AF' },
  qrWrap: { padding: 16, backgroundColor: '#FFFFFF' },
  closeButton: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F3F4F6' },
  closeButtonText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 24 },
  scanText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  scanFrame: { width: 240, height: 240, borderWidth: 2, borderColor: colors.green, borderRadius: 12 },
  cancelScan: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  cancelScanText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
});
