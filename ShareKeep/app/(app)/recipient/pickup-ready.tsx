import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { supabase, getDeliveryMatch } from '../../../lib/supabase';
import { colors, radius } from '../../../lib/theme';
import { ScreenHeader, PrimaryButton, Card, InfoRow } from '../../../components/ui';

type AgentInfo = {
  name: string;
  postalCode: string;
  address: string;
  floor: string;
};

export default function PickupReadyScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId: string }>();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [trackingNo, setTrackingNo] = useState<string>('—');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);

  useEffect(() => {
    if (!parcelId) { setLoading(false); return; }

    const fetchData = async () => {
      // delivery_matches から代理人を取得（agent_id で profiles を JOIN）
      const { data: match, error: matchError } = await getDeliveryMatch(parcelId);

      if (matchError || !match) {
        Alert.alert('エラー', '代理人情報の取得に失敗しました。');
        setLoading(false);
        return;
      }

      const m = match as any;
      const agentId = m.agent_id as string | null;
      const agentName = m.profiles?.full_name ?? '不明';

      // agent_profiles から住所を取得（user_id = agent_id, '|' 区切り）
      let postalCode = '';
      let address = '';
      let floor = '';
      if (agentId) {
        const { data: agentProfile } = await supabase
          .from('agent_profiles')
          .select('address')
          .eq('user_id', agentId)
          .maybeSingle();
        const parts = ((agentProfile as any)?.address ?? '').split('|');
        postalCode = parts[0] ?? '';
        address = parts[1] ?? '';
        floor = parts[2] ?? '';
      }

      setAgent({ name: agentName, postalCode, address, floor });

      // 追跡番号を parcels から取得
      const { data: parcel } = await supabase
        .from('parcels')
        .select('tracking_no')
        .eq('id', parcelId)
        .maybeSingle();
      setTrackingNo((parcel as any)?.tracking_no ?? '—');

      // 引き渡し確認QR（受取人提示用トークン）を取得
      const { data: token } = await supabase
        .from('qr_tokens')
        .select('token')
        .eq('parcel_id', parcelId)
        .eq('qr_type', 'recipient')
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      setQrToken((token as any)?.token ?? parcelId);

      setLoading(false);
    };

    fetchData();
  }, [parcelId]);

  const handleGoNow = () => {
    // TODO: Supabase で「向かっています」ステータスを更新
    Alert.alert('代理人に通知しました', '代理人に「今から向かいます」と伝えました。');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="荷物を受け取る" />

      <View style={styles.body}>
        <View style={styles.statusBanner}>
          <Ionicons name="home-outline" size={20} color={colors.green} />
          <Text style={styles.statusText}>代理人が荷物を預かっています</Text>
        </View>

        <Card>
          <Text style={styles.cardSectionTitle}>代理人の情報</Text>
          <View style={styles.agentRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={colors.green} />
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{agent?.name ?? '—'}</Text>
              {agent?.postalCode ? (
                <Text style={styles.agentAddress}>〒{agent.postalCode}</Text>
              ) : null}
              <Text style={styles.agentAddress}>{agent?.address || '—'}</Text>
              {agent?.floor ? (
                <Text style={styles.agentAddress}>{agent.floor}</Text>
              ) : null}
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardSectionTitle}>荷物の情報</Text>
          <InfoRow label="追跡番号" value={trackingNo} />
        </Card>

        <PrimaryButton label="今から取りに行く" icon="walk-outline" onPress={handleGoNow} />

        <TouchableOpacity style={styles.secondaryButton} onPress={() => setQrVisible(true)}>
          <Ionicons name="qr-code-outline" size={20} color={colors.green} />
          <Text style={styles.secondaryButtonText}>引き渡し確認QRを表示</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={qrVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>引き渡し確認QR</Text>
            <Text style={styles.modalDesc}>代理人に提示してスキャンしてもらってください</Text>

            <View style={styles.qrWrap}>
              {qrToken && <QRCode value={qrToken} size={200} />}
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
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: colors.greenLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.green,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.grayLight,
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
    backgroundColor: colors.greenLight,
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
    color: colors.ink,
  },
  agentAddress: {
    fontSize: 13,
    color: colors.gray,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.button,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: colors.green,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.green,
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
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  modalDesc: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
  },
  qrWrap: {
    padding: 16,
    backgroundColor: colors.white,
  },
  closeButton: {
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
});
