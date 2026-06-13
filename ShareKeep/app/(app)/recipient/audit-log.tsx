import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../../lib/theme';
import { ScreenHeader } from '../../../components/ui';
import { AuditLogVerifier } from '../../../components/AuditLogVerifier';
import { appendParcelEvent } from '../../../features/parcelEvents';
import type { ParcelEventType } from '../../../lib/database.types';

// 機能9: 監査ログ検証画面。parcelId を受け取り AuditLogVerifier を表示する。
// デモ用に「サンプルイベントを追記」ボタンを置き、appendParcelEvent を順に数回呼ぶ。

// デモ追記で使うイベント語彙（チェーン順に append する）。
const SAMPLE_EVENT_TYPES: ParcelEventType[] = [
  'registered',
  'matched',
  'handoff_primary',
  'completed',
];

export default function AuditLogScreen() {
  const params = useLocalSearchParams<{ parcelId?: string | string[] }>();
  const parcelId = Array.isArray(params.parcelId) ? params.parcelId[0] : params.parcelId;

  const [appending, setAppending] = useState(false);
  // 値を変えると AuditLogVerifier が再フェッチ・再検証する。
  const [reloadKey, setReloadKey] = useState(0);

  const handleAppendSamples = async () => {
    if (!parcelId) return;
    setAppending(true);
    try {
      // チェーン順に逐次追記（各 append は直前の hash を prev_hash にするため直列実行）。
      for (let i = 0; i < SAMPLE_EVENT_TYPES.length; i++) {
        await appendParcelEvent({
          parcelId,
          eventType: SAMPLE_EVENT_TYPES[i],
          payload: { step: i, note: 'demo sample event' },
        });
      }
      setReloadKey((k) => k + 1);
    } catch {
      Alert.alert('エラー', 'サンプルイベントの追記に失敗しました。');
    } finally {
      setAppending(false);
    }
  };

  if (!parcelId) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="監査ログ検証" />
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
          <Text style={styles.errorText}>parcelId が指定されていません。</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="監査ログ検証" />

      <View style={styles.body}>
        <AuditLogVerifier parcelId={parcelId} reloadKey={reloadKey} />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.demoButton}
          onPress={handleAppendSamples}
          disabled={appending}
          activeOpacity={0.8}
        >
          {appending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={18} color={colors.white} />
              <Text style={styles.demoButtonText}>サンプルイベントを追記（デモ）</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  footer: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { fontSize: 14, color: '#DC2626' },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.green,
    height: 52,
    borderRadius: 14,
  },
  demoButtonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
