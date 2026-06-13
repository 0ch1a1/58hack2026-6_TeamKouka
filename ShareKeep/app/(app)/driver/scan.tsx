import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../../lib/theme';
import { ScreenHeader } from '../../../components/ui';

// 【プレースホルダ / Wave 1-C `feat/driver-scan` で本実装】
// 役割: 代理人QRをカメラで読み取り、verifyAgentQr で delivered_to_agent へ。
// 使う契約（Wave 0 で確定済み）:
//   features/parcels: verifyAgentQr(token) / fetchParcel(parcelId)
//   カメラ:           expo-camera の CameraView + useCameraPermissions（agent/parcels.tsx を踏襲）
// params: { parcelId } を index から受け取り、成功後に fetchParcel で表示整合を確認。
// 必須: scanned フラグで二重読み取りガード。エラーは「無効/種別違い」「期限切れ」「通信失敗」で出し分け。
export default function DriverScanScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId?: string }>();
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人QRを読む" />
      <View style={styles.body}>
        <Text style={styles.note}>Wave 1-C でカメラ読み取りを実装</Text>
        <Text style={styles.sub}>parcelId: {parcelId ?? '(なし)'}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 24, gap: 8 },
  note: { fontSize: 14, fontWeight: '700', color: colors.driver },
  sub: { fontSize: 13, color: colors.gray },
});
