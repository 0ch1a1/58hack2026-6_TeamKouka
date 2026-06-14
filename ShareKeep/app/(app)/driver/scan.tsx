import { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius } from '../../../lib/theme';
import { ScreenHeader, Card, PrimaryButton } from '../../../components/ui';
import { verifyAgentQr, fetchParcel, updateParcelStatus } from '../../../features/parcels';
import { sendMessage } from '../../../features/messages';
import { isDemoQrToken } from '../../../lib/mockDemo';
import { logError } from '../../../lib/logger';

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// 代理人QR読み取り（配達員向け）。
// 代理人が提示する agent QR をカメラで読み、verifyAgentQr で荷物を
// delivered_to_agent（代理人へ受け渡し済み）まで進める。
// verify-agent-qr Edge Function は冪等化済みで、used 更新 / status 遷移 /
// 副作用はサーバ側トランザクションで処理する。失敗時は throw される。

// エラー出し分け用の種別。
type ErrorKind = 'invalid' | 'expired' | 'network';

// throw された Error.message から種別を推定する。
// 注意: Edge Function の返す文言に依存する暫定実装。根治は verify-agent-qr が
// 機械可読な error code を返す形（features/parcels.ts 改修）に寄せること。
// 誤分類を避けるため、まず network 系を判定してから expired → invalid の順に見る
// （'TypeError: Network request failed' を invalid に誤分類しないよう、単独の 'type' 一致は使わない）。
function classifyError(error: unknown): ErrorKind {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('通信')
  ) {
    return 'network';
  }
  if (message.includes('expire') || message.includes('期限')) return 'expired';
  if (
    message.includes('invalid') ||
    message.includes('wrong_type') ||
    message.includes('種別') ||
    message.includes('無効') ||
    message.includes('not found') ||
    message.includes('used')
  ) {
    return 'invalid';
  }
  // 判定できない場合は通信失敗に倒す。
  return 'network';
}

const ERROR_MESSAGE: Record<ErrorKind, string> = {
  invalid: '無効なQRコードです（種別が違う可能性があります）',
  expired: 'QRコードの有効期限が切れています',
  network: '通信に失敗しました。再度お試しください',
};

// done   : 受け渡し完了（status 確認済み or 確認不能=null）
// mismatch: verify は成功したが、選択中の荷物の status が delivered_to_agent でない
//           → 別荷物のQRを誤読した可能性。成功画面にせず警告する。
type Phase = 'scanning' | 'verifying' | 'done' | 'mismatch' | 'error';

export default function DriverScanScreen() {
  const { parcelId: rawParcelId } = useLocalSearchParams<{ parcelId?: string }>();
  // Expo Router の search param は配列で返ることがあるため string に正規化。
  const parcelId = typeof rawParcelId === 'string' && rawParcelId.length > 0 ? rawParcelId : undefined;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 表示整合チェックの結果メモ（delivered_to_agent になっていれば true、読めなければ null）。
  const [statusConfirmed, setStatusConfirmed] = useState<boolean | null>(null);
  // 二重読み取りの同期ガード。state(scanned) は反映が非同期で、CameraView の連続発火に
  // 対して取りこぼすため、即時反映の ref を併用する（true で以降の発火を確実に弾く）。
  const scannedRef = useRef(false);

  // 再スキャンへ戻す。
  const resetScan = useCallback(() => {
    scannedRef.current = false;
    setScanned(false);
    setPhase('scanning');
    setErrorMsg(null);
    setStatusConfirmed(null);
  }, []);

  const handleScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scannedRef.current) return; // 同期ガード（最優先）
      scannedRef.current = true;
      setScanned(true);
      setPhase('verifying');
      setErrorMsg(null);

      // デモ用QRトークン: 実荷物のステータスを delivered_to_agent に遷移させてから完了表示
      if (isDemoQrToken(data)) {
        if (parcelId) {
          try {
            await updateParcelStatus(parcelId, 'delivered_to_agent');
            setStatusConfirmed(true);
          } catch {
            setStatusConfirmed(null);
          }
          if (isValidUuid(parcelId)) {
            try {
              await sendMessage(parcelId, '配達員から代理人に荷物が受け渡されました。代理人の方よりご連絡をお待ちください。');
            } catch { /* 自動メッセージ失敗は無視 */ }
          }
        } else {
          setStatusConfirmed(null);
        }
        setPhase('done');
        return;
      }

      try {
        // 代理人QRを検証。used 更新 / status 遷移（delivered_to_agent）/ 副作用は
        // verify-agent-qr Edge Function がサーバ側で処理する（冪等）。
        await verifyAgentQr(data);
      } catch (error) {
        logError('driver/scan:verifyAgentQr', error);
        setErrorMsg(ERROR_MESSAGE[classifyError(error)]);
        setPhase('error');
        return;
      }

      // 表示整合チェック。parcelId が無い場合（QR token から荷物を解決できる）は
      // fetchParcel をスキップして完了扱いにする。
      if (parcelId) {
        let parcel = null;
        try {
          parcel = await fetchParcel(parcelId);
        } catch (error) {
          logError('driver/scan:fetchParcel', error);
          setStatusConfirmed(null);
          if (isValidUuid(parcelId)) {
            try { await sendMessage(parcelId, '配達員から代理人に荷物が受け渡されました。代理人の方よりご連絡をお待ちください。'); } catch { /* 無視 */ }
          }
          setPhase('done');
          return;
        }
        if (parcel === null) {
          setStatusConfirmed(null);
          setPhase('done');
        } else if (parcel.status === 'delivered_to_agent') {
          setStatusConfirmed(true);
          if (isValidUuid(parcelId)) {
            try { await sendMessage(parcelId, '配達員から代理人に荷物が受け渡されました。代理人の方よりご連絡をお待ちください。'); } catch { /* 無視 */ }
          }
          setPhase('done');
        } else {
          setStatusConfirmed(false);
          setPhase('mismatch');
        }
        return;
      }

      setStatusConfirmed(null);
      setPhase('done');
    },
    [parcelId],
  );

  // 権限読み込み中。
  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="代理人QRを読む" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.driver} />
        </View>
      </SafeAreaView>
    );
  }

  // 権限未許可。
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="代理人QRを読む" />
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={48} color={colors.driver} />
          <Text style={styles.permTitle}>カメラの利用許可が必要です</Text>
          <Text style={styles.permSub}>
            代理人のQRコードを読み取るには、カメラへのアクセスを許可してください。
          </Text>
          {permission.canAskAgain ? (
            <PrimaryButton
              label="カメラを許可する"
              icon="camera"
              onPress={requestPermission}
              style={styles.permButton}
            />
          ) : (
            <>
              <Text style={styles.permSub}>設定アプリからカメラへのアクセスを許可してください。</Text>
              <PrimaryButton
                label="設定を開く"
                icon="settings-outline"
                onPress={() => Linking.openSettings()}
                style={styles.permButton}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人QRを読む" />

      {phase === 'scanning' && (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleScanned}
          />
          <View style={styles.scanOverlay}>
            <Text style={styles.scanText}>代理人のQRコードをスキャン</Text>
            <View style={styles.scanFrame} />
          </View>
        </View>
      )}

      {phase === 'verifying' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.driver} />
          <Text style={styles.statusText}>QRコードを照合しています...</Text>
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.resultBody}>
          <Card>
            <View style={styles.resultRow}>
              <Ionicons name="checkmark-circle" size={28} color={colors.green} />
              <Text style={styles.resultTitle}>代理人へ受け渡し完了</Text>
            </View>
            <Text style={styles.resultSub}>荷物を代理人へ引き渡しました。</Text>
            {statusConfirmed === true ? (
              <View style={styles.confirmRow}>
                <Ionicons name="cube" size={16} color={colors.driver} />
                <Text style={styles.confirmText}>ステータス: 代理人へ受け渡し済み</Text>
              </View>
            ) : (
              // statusConfirmed === null（確認不能）。verify 自体は成功している。
              <View style={styles.confirmRow}>
                <Ionicons name="information-circle-outline" size={16} color={colors.grayLight} />
                <Text style={styles.confirmTextMuted}>
                  照合は成功しました（ステータス反映は確認できませんでした）。
                </Text>
              </View>
            )}
          </Card>
          {parcelId && isValidUuid(parcelId) && (
            <PrimaryButton
              label="チャットを確認する"
              icon="chatbubbles-outline"
              onPress={() => router.replace({ pathname: '/(app)/messages/[parcelId]', params: { parcelId } })}
              style={styles.chatButton}
            />
          )}
          <PrimaryButton label="一覧に戻る" icon="arrow-back" onPress={() => router.back()} style={parcelId && isValidUuid(parcelId) ? styles.secondaryButton : undefined} />
        </View>
      )}

      {phase === 'mismatch' && (
        <View style={styles.resultBody}>
          <Card>
            <View style={styles.resultRow}>
              <Ionicons name="warning" size={28} color="#D97706" />
              <Text style={styles.warnTitle}>荷物を確認してください</Text>
            </View>
            <Text style={styles.resultSub}>
              QRの照合は成功しましたが、選択中の荷物が「代理人へ受け渡し済み」になっていません。
              別の荷物のQRコードを読み取った可能性があります。荷物を確認してください。
            </Text>
          </Card>
          <PrimaryButton label="もう一度読み取る" icon="scan" onPress={resetScan} />
          <PrimaryButton label="一覧に戻る" icon="arrow-back" onPress={() => router.back()} style={styles.secondaryButton} />
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.resultBody}>
          <Card>
            <View style={styles.resultRow}>
              <Ionicons name="alert-circle" size={28} color="#DC2626" />
              <Text style={styles.errorTitle}>読み取りに失敗しました</Text>
            </View>
            <Text style={styles.resultSub}>{errorMsg}</Text>
          </Card>
          <PrimaryButton label="もう一度読み取る" icon="scan" onPress={resetScan} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  permTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  permSub: { fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 20 },
  permButton: { backgroundColor: colors.driver, marginTop: spacing.sm },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scanOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  scanText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: colors.driver,
    borderRadius: radius.card,
  },
  statusText: { fontSize: 14, color: colors.gray },
  resultBody: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultTitle: { fontSize: 17, fontWeight: '700', color: colors.green },
  errorTitle: { fontSize: 17, fontWeight: '700', color: '#DC2626' },
  warnTitle: { fontSize: 17, fontWeight: '700', color: '#D97706' },
  chatButton: { backgroundColor: colors.green },
  secondaryButton: { backgroundColor: colors.grayLight },
  resultSub: { fontSize: 14, color: colors.gray, marginTop: spacing.sm, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  confirmText: { fontSize: 13, fontWeight: '600', color: colors.driver },
  confirmTextMuted: { fontSize: 13, color: colors.grayLight, flex: 1 },
});
