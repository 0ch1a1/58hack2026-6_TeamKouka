import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

// TODO: Supabase から取得
const MOCK_AGENT = {
  name: '田中 花子',
  address: '東京都渋谷区代々木1-2-3',
  floor: '203号室',
  note: 'インターフォンを押してください',
};

export default function PickupReadyScreen() {
  const { packageName, trackingNumber } = useLocalSearchParams<{
    packageName: string;
    trackingNumber: string;
  }>();
  const [qrVisible, setQrVisible] = useState(false);

  const handleGoNow = () => {
    // TODO: Supabase で「向かっています」ステータスを更新
    Alert.alert('代理人に通知しました', '代理人に「今から向かいます」と伝えました。');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>荷物を受け取る</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.body}>
        <View style={styles.statusBanner}>
          <Ionicons name="home-outline" size={20} color={GREEN} />
          <Text style={styles.statusText}>代理人が荷物を預かっています</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>代理人の情報</Text>
          <View style={styles.agentRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={GREEN} />
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{MOCK_AGENT.name}</Text>
              <Text style={styles.agentAddress}>{MOCK_AGENT.address}</Text>
              <Text style={styles.agentAddress}>{MOCK_AGENT.floor}</Text>
            </View>
          </View>
          {MOCK_AGENT.note ? (
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
              <Text style={styles.noteText}>{MOCK_AGENT.note}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>荷物の情報</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>荷物名</Text>
            <Text style={styles.infoValue}>{packageName ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>追跡番号</Text>
            <Text style={styles.infoValue}>{trackingNumber ?? '—'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleGoNow}>
          <Ionicons name="walk-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>今から取りに行く</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => setQrVisible(true)}>
          <Ionicons name="qr-code-outline" size={20} color={GREEN} />
          <Text style={styles.secondaryButtonText}>引き渡し確認QRを表示</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={qrVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>引き渡し確認QR</Text>
            <Text style={styles.modalDesc}>代理人に提示してスキャンしてもらってください</Text>

            {/* TODO: qr_tokens から取得したトークンでQRコードを生成 */}
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code" size={120} color="#111827" />
              <Text style={styles.qrNote}>（実装後はQRコードが表示されます）</Text>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={() => setQrVisible(false)}>
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: GREEN,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  agentRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentInfo: {
    flex: 1,
    gap: 2,
  },
  agentName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  agentAddress: {
    fontSize: 13,
    color: '#6B7280',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    width: 72,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: GREEN,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: GREEN,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  qrPlaceholder: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  qrNote: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  closeButton: {
    width: '100%',
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
