import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../../lib/theme';
import { signOut } from '../../../features/auth';

// 【プレースホルダ / Wave 1-A `feat/driver-home` で本実装】
// 役割: 配達員ホーム＝担当荷物リスト。
// 使う契約（Wave 0 で確定済み）:
//   features/parcels: fetchDriverParcels(DEMO_DELIVERY_COMPANY_ID) / startDelivery / reportDeliveryFailed
//   lib/status:       DRIVER_STATUS_LABEL / driverActionsFor(status)
//   lib/config:       DEMO_DELIVERY_COMPANY_ID
// 遷移契約:
//   代理人を探す → router.push({ pathname: '/(app)/driver/agents', params: { parcelId } })
//   代理人QRを読む → router.push({ pathname: '/(app)/driver/scan',   params: { parcelId } })
export default function DriverHomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>配達員ホーム</Text>
        <Text style={styles.note}>Wave 1-A で荷物リストを実装</Text>

        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push({ pathname: '/(app)/driver/agents', params: { parcelId: 'demo' } })}
        >
          <Text style={styles.linkText}>代理人を探す（agents）</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push({ pathname: '/(app)/driver/scan', params: { parcelId: 'demo' } })}
        >
          <Text style={styles.linkText}>代理人QRを読む（scan）</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOut}
          onPress={async () => {
            try {
              await signOut();
            } catch {
              Alert.alert('エラー', 'ログアウトに失敗しました。');
            }
          }}
        >
          <Text style={styles.signOutText}>ログアウト</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.driver },
  note: { fontSize: 13, color: colors.gray, marginBottom: 12 },
  link: { backgroundColor: colors.driver, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  linkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  signOut: { marginTop: 'auto', paddingVertical: 14, alignItems: 'center' },
  signOutText: { color: colors.gray, fontSize: 14, fontWeight: '600' },
});
