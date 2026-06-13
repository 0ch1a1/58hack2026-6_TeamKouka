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

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

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
    const { data } = await supabase
      .from('qr_tokens')
      .select('token')
      .eq('parcel_id', parcel.parcelId)
      .eq('qr_type', 'driver')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    const token = data?.token ?? parcel.parcelId;
    setQrParcel({ ...parcel, qrToken: token });
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

    const { data: tokenData, error } = await supabase
      .from('qr_tokens')
      .select('id, parcel_id')
      .eq('token', data)
      .eq('qr_type', 'recipient')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !tokenData) {
      Alert.alert('エラー', 'QRコードが無効または期限切れです。');
      return;
    }

    await Promise.all([
      supabase.from('qr_tokens').update({ used: true }).eq('id', tokenData.id),
      supabase.from('parcels').update({ status: 'completed' }).eq('id', tokenData.parcel_id),
      supabase.from('delivery_matches').update({ status: 'completed' }).eq('parcel_id', tokenData.parcel_id),
    ]);

    Alert.alert('引き渡し完了！', '荷物の引き渡しが完了しました。', [
      { text: 'OK', onPress: () => {
        fetchParcels();
        router.push({ pathname: '/(app)/agent/complete', params: { parcelId: tokenData.parcel_id } });
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>請負リスト</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : (
        <FlatList
          data={parcels}
          keyExtractor={item => item.matchId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="cube-outline" size={16} color={GREEN} />
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
                  <Ionicons name="qr-code-outline" size={16} color={GREEN} />
                  <Text style={styles.qrButtonText}>配達員用QR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanButton} onPress={() => handleOpenScanner(item)}>
                  <Ionicons name="scan-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.scanButtonText}>受取人QRスキャン</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#111827' },
  headerRight: { width: 36 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  statusBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600', color: GREEN },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#6B7280' },
  actionRow: { flexDirection: 'row', gap: 8 },
  qrButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: GREEN },
  qrButtonText: { fontSize: 13, fontWeight: '600', color: GREEN },
  scanButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: GREEN },
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
  scanFrame: { width: 240, height: 240, borderWidth: 2, borderColor: GREEN, borderRadius: 12 },
  cancelScan: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  cancelScanText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
});
