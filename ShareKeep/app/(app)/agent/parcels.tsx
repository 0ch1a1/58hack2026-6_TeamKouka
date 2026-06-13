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
import { ScreenHeader, Card } from '../../../components/ui';
import { generateQrToken, verifyRecipientQr } from '../../../features/parcels';

type MatchedParcel = {
  matchId: string;
  parcelId: string;
  trackingNo: string;
  recipientName: string;
  status: string;
  qrToken: string | null;
};

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

    const mapped: MatchedParcel[] = (data ?? []).map((m: any) => ({
      matchId: m.id,
      parcelId: m.parcel_id,
      trackingNo: m.parcels?.tracking_no ?? '—',
      recipientName: m.profiles?.full_name ?? '不明',
      status: m.status ?? 'matched',
      qrToken: null,
    }));

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
    const handedParcelId = scanParcel.parcelId;
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
        fetchParcels();
        // TODO(B5): agent/complete 未実装
        router.push({ pathname: '/(app)/agent/complete', params: { parcelId: handedParcelId } });
      }},
    ]);
  };

  const STATUS_LABEL: Record<string, string> = {
    matched: 'マッチング済み',
    storing: '保管中',
    delivering: '配送中',
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
          renderItem={({ item }) => (
            <Card>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="cube-outline" size={16} color={colors.green} />
                  <Text style={styles.cardTitle}>{item.trackingNo}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{STATUS_LABEL[item.status] ?? item.status}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={14} color="#9CA3AF" />
                <Text style={styles.metaText}>受取人: {item.recipientName}</Text>
              </View>

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
            </Card>
          )}
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
  statusBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600', color: colors.green },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#6B7280' },
  actionRow: { flexDirection: 'row', gap: 8 },
  qrButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.green },
  qrButtonText: { fontSize: 13, fontWeight: '600', color: colors.green },
  scanButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.green },
  scanButtonText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
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
