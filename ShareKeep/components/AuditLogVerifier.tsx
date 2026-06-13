import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { fetchParcelEvents } from '../features/parcelEvents';
import { verifyChain, type ChainVerifyResult } from '../lib/parcelEventsHash';
import type { ParcelEvent } from '../lib/database.types';

// 機能9: 監査ログ検証 UI。対象 parcel のイベントを created_at 昇順で取得し、
// verifyChain で各行を再計算・突合して OK(緑)/NG(赤) を表示する。最初に壊れた位置を強調する。
//
// これは「内部の誤操作・後付け改変の検知補助」であり「改ざん不能」の証明ではない
// （運営権限による全 hash 再計算は防げない）。詳細は lib/parcelEventsHash.ts を参照。

type Row = { event: ParcelEvent; result: ChainVerifyResult };

// 親（画面）から再取得をトリガーするための任意キー。値が変わると再フェッチする。
export function AuditLogVerifier({
  parcelId,
  reloadKey,
}: {
  parcelId: string;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const events = await fetchParcelEvents(parcelId);
      const results = await verifyChain(events);
      setRows(events.map((event, i) => ({ event, result: results[i] })));
    } catch {
      setError('監査ログの取得・検証に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [parcelId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-text-outline" size={40} color={colors.grayLight} />
        <Text style={styles.emptyText}>イベントがありません</Text>
      </View>
    );
  }

  const firstBroken = rows[0].result.firstBrokenIndex;
  const allOk = firstBroken === null;

  return (
    <View style={styles.container}>
      <View style={[styles.summary, allOk ? styles.summaryOk : styles.summaryNg]}>
        <Ionicons
          name={allOk ? 'shield-checkmark' : 'warning'}
          size={20}
          color={allOk ? colors.green : '#DC2626'}
        />
        <Text style={[styles.summaryText, { color: allOk ? colors.green : '#DC2626' }]}>
          {allOk
            ? `チェーン整合 OK（${rows.length}件）`
            : `整合性が崩れています（最初の破損: ${firstBroken! + 1}件目）`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {rows.map(({ event, result }) => {
          const isFirstBroken = result.firstBrokenIndex === result.index;
          return (
            <View
              key={event.id}
              style={[
                styles.card,
                result.ok ? styles.cardOk : styles.cardNg,
                isFirstBroken && styles.cardFirstBroken,
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons
                    name={result.ok ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={result.ok ? colors.green : '#DC2626'}
                  />
                  <Text style={styles.cardIndex}>#{result.index + 1}</Text>
                  <Text style={styles.cardType}>{event.event_type}</Text>
                </View>
                {isFirstBroken && (
                  <View style={styles.brokenBadge}>
                    <Text style={styles.brokenBadgeText}>最初の破損</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {event.created_at}
              </Text>
              <Text style={styles.cardHash} numberOfLines={1}>
                hash: {event.hash}
              </Text>
              <Text style={styles.cardHash} numberOfLines={1}>
                prev: {event.prev_hash ?? '(先頭)'}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <Text style={styles.note}>
        ※ クライアント計算による検知補助です。運営権限（service_role）は全 hash
        を再計算すれば整合を保ったまま改変でき、これは「改ざん不能」の証明ではありません。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  errorText: { fontSize: 14, color: '#DC2626' },
  emptyText: { fontSize: 15, color: colors.grayLight },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryOk: { backgroundColor: colors.greenLight, borderColor: colors.green },
  summaryNg: { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
  summaryText: { fontSize: 14, fontWeight: '700', flex: 1 },
  list: { gap: 10, paddingBottom: 8 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
  },
  cardOk: { borderColor: colors.border },
  cardNg: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  cardFirstBroken: { borderColor: '#DC2626', borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardIndex: { fontSize: 13, fontWeight: '700', color: colors.gray },
  cardType: { fontSize: 14, fontWeight: '700', color: colors.ink },
  brokenBadge: { backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  brokenBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  cardMeta: { fontSize: 12, color: colors.gray },
  cardHash: { fontSize: 11, color: colors.grayLight, fontFamily: 'monospace' },
  note: { fontSize: 11, color: colors.grayLight, lineHeight: 16 },
});
