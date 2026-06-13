import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../../lib/theme';
import { ScreenHeader } from '../../../components/ui';

// 【プレースホルダ / Wave 1-B `feat/driver-agents` で本実装】
// 役割: 代理人マップ＋リストで選び、対象荷物に割り当て。
// 使う契約（Wave 0 で確定済み）:
//   features/parcels: getAgentLocations() / assignAgentToParcel({ parcelId, agentId, distanceMeters })
//   依存:             react-native-maps（package.json に追加済み）
// params: { parcelId } を index から受け取る。
// 必須: 地図が初期化できない端末向けにリスト表示のフォールバックを併設する。
export default function DriverAgentsScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId?: string }>();
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人を探す" />
      <View style={styles.body}>
        <Text style={styles.note}>Wave 1-B で地図＋代理人リストを実装</Text>
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
