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
import { generateQrToken, subscribeParcel, fetchParcel } from '../../../features/parcels';
import { sendMessage } from '../../../features/messages';
import { fetchDeliveryLocation, subscribeDeliveryLocation } from '../../../features/tracking';
import { isHandedOff } from '../../../lib/status';
import { isMockParcelId, MOCK_PARCEL_INFO, buildMockQrToken } from '../../../lib/mockDemo';
import { colors, radius } from '../../../lib/theme';
import type { DeliveryLocation } from '../../../lib/database.types';
import { ScreenHeader, PrimaryButton, Card, InfoRow } from '../../../components/ui';
import { DeliveryProgress } from '../../../components/DeliveryProgress';
import { StorageDeadlineBadge } from '../../../components/StorageDeadlineBadge';
import { SupportReportForm } from '../../../components/SupportReportForm';

type AgentInfo = {
  name: string;
  address: string;
  floor: string;
};

// getDeliveryMatch（select('*, profiles!agent_id(full_name, phone)')）の結果のうち
// この画面で参照する最小フィールドだけを表す型。profiles は to-one 埋め込みで実行時は単一オブジェクト。
type DeliveryMatchRow = {
  agent_id: string | null;
  profiles: { full_name: string | null } | null;
};

// agent_profiles.select('address, address_detail') の最小型。
type AgentProfileRow = {
  address: string | null;
  address_detail: string | null;
};

export default function PickupReadyScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId: string }>();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [trackingNo, setTrackingNo] = useState<string>('—');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  // 機能6: 保管期限 / 機能8: トラブル報告モーダル
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation | null>(null);
  // 受取調整の定型メッセージ送信中フラグ（連打防止）。送信中は ETA ボタン群を無効化する。
  const [sendingEta, setSendingEta] = useState(false);

  useEffect(() => {
    if (!parcelId) { setLoading(false); return; }

    const fetchData = async () => {
      // モック荷物はDBに実データが存在しないため静的情報で代替
      if (isMockParcelId(parcelId)) {
        const mock = MOCK_PARCEL_INFO[parcelId];
        if (mock) {
          setTrackingNo(mock.trackingNo);
          setDeadlineAt(mock.deadlineAt);
          setAgent({ name: mock.agentName, address: mock.agentAddress, floor: mock.agentFloor });
          setQrToken(buildMockQrToken(mock.trackingNo));
        }
        setLoading(false);
        return;
      }

      // 代理受取スポット(JOIN) / 追跡番号は parcelId だけで引けて互いに独立なので並列取得
      const [
        { data: match, error: matchError },
        parcel,
      ] = await Promise.all([
        // delivery_matches から代理受取スポットを取得（agent_id で profiles を JOIN・A7 許可）
        getDeliveryMatch(parcelId),
        // 追跡番号を parcels から取得（features 経由）
        fetchParcel(parcelId),
      ]);

      setTrackingNo(parcel?.tracking_no ?? '—');
      setDeadlineAt(parcel?.storage_deadline_at ?? null);

      // 引き渡し確認QR（受取人提示用トークン）を features 経由で生成
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const token = await generateQrToken({
            parcelId,
            userId: user.id,
            qrType: 'recipient',
          });
          setQrToken(token ?? parcelId);
        } else {
          setQrToken(parcelId);
        }
      } catch {
        // QR 生成失敗時はフォールバックとして parcelId を表示（旧挙動踏襲）
        setQrToken(parcelId);
      }

      if (matchError) {
        // RLS またはネットワークエラー。代理受取スポット情報なしで続行（QR 表示は可能）。
        setLoading(false);
        return;
      }
      if (!match) {
        // マッチがまだ存在しない（代理受取スポット未割り当て）。
        setLoading(false);
        return;
      }

      const m = match as DeliveryMatchRow;
      const agentId = m.agent_id;
      const agentName = m.profiles?.full_name ?? '不明';

      // agent_profiles から住所を取得（user_id = agent_id）。
      // geocode-agent-address は address（ジオコ結果の display_name）と
      // address_detail（部屋番号等）を分けて保存するため、旧 '|' 連結パースは廃止し
      // 両カラムをそのまま読む（profile.tsx の保存形式に追従）。
      let address = '';
      let floor = '';
      if (agentId) {
        const { data: agentProfile } = await supabase
          .from('agent_profiles')
          .select('address, address_detail')
          .eq('user_id', agentId)
          .maybeSingle();
        const profile = agentProfile as AgentProfileRow | null;
        address = profile?.address ?? '';
        floor = profile?.address_detail ?? '';
      }

      setAgent({ name: agentName, address, floor });
      setLoading(false);
    };

    fetchData();

    // 引き渡し完了（handed_to_recipient / completed）になったら受取完了画面へ遷移
    const unsubscribe = subscribeParcel(parcelId, async () => {
      const parcel = await fetchParcel(parcelId);
      if (isHandedOff(parcel?.status ?? null)) {
        router.replace({ pathname: '/(app)/recipient/delivery-complete', params: { parcelId } });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [parcelId]);

  useEffect(() => {
    if (!parcelId) {
      setDeliveryLocation(null);
      return;
    }

    let active = true;
    setDeliveryLocation(null);

    fetchDeliveryLocation(parcelId)
      .then((location) => {
        if (active) setDeliveryLocation(location);
      })
      .catch(() => {
        if (active) setDeliveryLocation(null);
      });

    const unsubscribe = subscribeDeliveryLocation(parcelId, (location) => {
      setDeliveryLocation(location);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [parcelId]);

  // 受取調整の定型文を handover_messages へ送信する（sendMessage 経由）。
  // 専用テーブルは作らず既存メッセージ基盤を流用し、代理受取スポット側へ受取予定を伝える。
  const sendEtaMessage = async (body: string) => {
    if (!parcelId || sendingEta) return;
    setSendingEta(true);
    try {
      await sendMessage(parcelId, body);
      Alert.alert('送信しました', `代理受取スポットに「${body}」と伝えました。`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'メッセージの送信に失敗しました。';
      Alert.alert('送信に失敗しました', msg);
    } finally {
      setSendingEta(false);
    }
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
          <Text style={styles.statusText}>代理受取スポットが荷物を預かっています</Text>
        </View>

        <DeliveryProgress
          progress={deliveryLocation?.progress ?? 0}
          updatedAt={deliveryLocation?.updated_at}
        />

        <Card>
          <Text style={styles.cardSectionTitle}>代理受取スポットの情報</Text>
          <View style={styles.agentRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={colors.green} />
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{agent?.name ?? '—'}</Text>
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
          {/* 機能6: 保管期限（当日中/残りわずか/期限超過） */}
          <StorageDeadlineBadge deadlineAt={deadlineAt} />
        </Card>

        {/* 受取調整: 定型文を代理受取スポットへ送信（handover_messages 流用） */}
        <Card>
          <Text style={styles.cardSectionTitle}>受け取りの予定を伝える</Text>
          <View style={styles.etaButtons}>
            <PrimaryButton
              label="今から取りに行きます"
              icon="walk-outline"
              onPress={() => sendEtaMessage('今から取りに行きます')}
              loading={sendingEta}
              disabled={sendingEta}
            />
            <TouchableOpacity
              style={[styles.etaChip, sendingEta && styles.etaChipDisabled]}
              onPress={() => sendEtaMessage('約30分で着きます')}
              disabled={sendingEta}
            >
              <Ionicons name="time-outline" size={18} color={colors.green} />
              <Text style={styles.etaChipText}>約30分で着きます</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.etaChip, sendingEta && styles.etaChipDisabled]}
              onPress={() => sendEtaMessage('19:30ごろ取りに行きます')}
              disabled={sendingEta}
            >
              <Ionicons name="time-outline" size={18} color={colors.green} />
              <Text style={styles.etaChipText}>19:30ごろ取りに行きます</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => setQrVisible(true)}>
          <Ionicons name="qr-code-outline" size={20} color={colors.green} />
          <Text style={styles.secondaryButtonText}>引き渡し確認QRを表示</Text>
        </TouchableOpacity>

        {parcelId ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              router.push({ pathname: '/(app)/messages/[parcelId]', params: { parcelId } })
            }
          >
            <Ionicons name="chatbubbles-outline" size={20} color={colors.green} />
            <Text style={styles.secondaryButtonText}>メッセージ</Text>
          </TouchableOpacity>
        ) : null}

        {/* 機能8: 簡易トラブル報告 */}
        {parcelId ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setReportVisible(true)}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.green} />
            <Text style={styles.secondaryButtonText}>問題を報告</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 機能8: トラブル報告モーダル */}
      <Modal visible={reportVisible} transparent animationType="fade" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>問題を報告</Text>
            {parcelId && (
              <SupportReportForm parcelId={parcelId} onDone={() => setReportVisible(false)} />
            )}
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setReportVisible(false)}>
              <Text style={styles.secondaryButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={qrVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>引き渡し確認QR</Text>
            <Text style={styles.modalDesc}>代理受取スポットに提示してスキャンしてもらってください</Text>

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
  etaButtons: {
    gap: 12,
    marginTop: 8,
  },
  etaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.greenLight,
    borderRadius: radius.button,
    paddingVertical: 14,
  },
  etaChipDisabled: {
    opacity: 0.5,
  },
  etaChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.green,
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
