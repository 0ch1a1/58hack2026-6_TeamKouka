import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius } from '../../../lib/theme';
import { ScreenHeader, Card, PrimaryButton } from '../../../components/ui';
import { verifyAgentQr, fetchParcel } from '../../../features/parcels';

// 代理人QR読み取り（配達員向け）。
// 代理人が提示する agent QR をカメラで読み、verifyAgentQr で荷物を
// delivered_to_agent（代理人へ受け渡し済み）まで進める。
// verify-agent-qr Edge Function は冪等化済みで、used 更新 / status 遷移 /
// 副作用はサーバ側トランザクションで処理する。失敗時は throw される。

// エラー出し分け用の種別。
type ErrorKind = 'invalid' | 'expired' | 'network';

// throw された Error.message から種別を推定する。
// メッセージ文言に依存するため、判定できない場合は通信失敗（network）に倒す。
function classifyError(error: unknown): ErrorKind {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (message.includes('expire') || message.includes('期限')) return 'expired';
  if (
    message.includes('invalid') ||
    message.includes('type') ||
    message.includes('種別') ||
    message.includes('無効')
  ) {
    return 'invalid';
  }
  return 'network';
}

const ERROR_MESSAGE: Record<ErrorKind, string> = {
  invalid: '無効なQRコードです（種別が違う可能性があります）',
  expired: 'QRコードの有効期限が切れています',
  network: '通信に失敗しました。再度お試しください',
};

type Phase = 'scanning' | 'verifying' | 'done' | 'error';

export default function DriverScanScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 表示整合チェックの結果メモ（delivered_to_agent になっていれば true）。
  const [statusConfirmed, setStatusConfirmed] = useState<boolean | null>(null);

  // 画面表示時にカメラ権限をリクエスト。
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // 再スキャンへ戻す。
  const resetScan = useCallback(() => {
    setScanned(false);
    setPhase('scanning');
    setErrorMsg(null);
    setStatusConfirmed(null);
  }, []);

  const handleScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      setPhase('verifying');
      setErrorMsg(null);

      try {
        // 代理人QRを検証。used 更新 / status 遷移（delivered_to_agent）/ 副作用は
        // verify-agent-qr Edge Function がサーバ側で処理する（冪等）。
        await verifyAgentQr(data);
      } catch (error) {
        setErrorMsg(ERROR_MESSAGE[classifyError(error)]);
        setPhase('error');
        return;
      }

      // 表示整合チェック。parcelId が無い場合（QR token から荷物を解決できる）は
      // fetchParcel をスキップして完了扱いにする。
      if (parcelId) {
        try {
          const parcel = await fetchParcel(parcelId);
          setStatusConfirmed(parcel?.status === 'delivered_to_agent');
        } catch {
          // 整合確認の失敗は致命的ではない。verify は成功しているため完了扱いにし、
          // 確認は不明（null）のままにする。
          setStatusConfirmed(null);
        }
      }

      setPhase('done');
    },
    [scanned, parcelId],
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
            <Text style={styles.permSub}>設定アプリからカメラへのアクセスを許可してください。</Text>
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
            {parcelId ? (
              statusConfirmed === true ? (
                <View style={styles.confirmRow}>
                  <Ionicons name="cube" size={16} color={colors.driver} />
                  <Text style={styles.confirmText}>ステータス: 代理人へ受け渡し済み</Text>
                </View>
              ) : statusConfirmed === false ? (
                <View style={styles.confirmRow}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.grayLight} />
                  <Text style={styles.confirmTextMuted}>
                    照合は成功しました（ステータス反映の確認中）。
                  </Text>
                </View>
              ) : (
                <View style={styles.confirmRow}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.grayLight} />
                  <Text style={styles.confirmTextMuted}>照合は成功しました。</Text>
                </View>
              )
            ) : null}
          </Card>
          <PrimaryButton label="完了して戻る" icon="arrow-back" onPress={() => router.back()} />
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
  resultSub: { fontSize: 14, color: colors.gray, marginTop: spacing.sm, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  confirmText: { fontSize: 13, fontWeight: '600', color: colors.driver },
  confirmTextMuted: { fontSize: 13, color: colors.grayLight, flex: 1 },
});
