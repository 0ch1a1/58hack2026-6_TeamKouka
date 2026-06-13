import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchParcel } from '../../../features/parcels';
import { createReview, fetchReviewForParcel, type AgentReview } from '../../../features/reviews';
import { colors, spacing, radius } from '../../../lib/theme';
import { PrimaryButton, Card, InfoRow } from '../../../components/ui';
import { CompletionModal } from '../../../components/CompletionModal';

type Result = {
  trackingNo: string;
  co2Saved: number;
};

const MAX_RATING = 5;

export default function DeliveryCompleteScreen() {
  const { parcelId } = useLocalSearchParams<{ parcelId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  // 完了演出モーダル。結果取得後に自動表示し、閉じるとホームへ戻る。
  const [showCelebration, setShowCelebration] = useState(false);

  // 評価フォーム状態。existingReview が非null なら投稿済み表示に切り替える。
  const [existingReview, setExistingReview] = useState<AgentReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!parcelId) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        // ポイント（報酬）は代理人にのみ付与され受取人は0件のため、受取人の完了画面では
        // ポイントを表示しない（CO2削減貢献を主表示）。よって parcel 取得のみ。
        const parcel = await fetchParcel(parcelId);
        setResult({
          trackingNo: parcel?.tracking_no ?? '—',
          co2Saved: Number(parcel?.co2_saved_kg ?? 0),
        });
      } catch {
        // 取得失敗時も結果画面はデフォルト表示で継続（既存UXを維持）
        setResult({ trackingNo: '—', co2Saved: 0 });
      }

      // 評価の投稿済み確認は CO2 表示とは独立。失敗してもフォームは出す（未投稿扱い）。
      try {
        const review = await fetchReviewForParcel(parcelId);
        setExistingReview(review);
      } catch {
        setExistingReview(null);
      } finally {
        setLoading(false);
        setShowCelebration(true);
      }
    };

    fetchData();
  }, [parcelId]);

  const handleSubmit = async () => {
    if (!parcelId) return;
    if (rating < 1) {
      Alert.alert('評価を選択してください', '星を1つ以上選んでください。');
      return;
    }
    try {
      setSubmitting(true);
      const review = await createReview({
        parcelId,
        rating,
        comment: comment.trim() || null,
      });
      setExistingReview(review);
    } catch (e) {
      // 二重評価（UNIQUE(parcel_id) 違反 = Postgres 23505）は「失敗」ではなく
      // 既に評価済み。投稿済みレビューを取り直して評価済み表示へ復旧する。
      const code = (e as { code?: string } | null)?.code;
      const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
      if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        try {
          const existing = await fetchReviewForParcel(parcelId);
          if (existing) setExistingReview(existing);
        } catch {
          /* 取り直し失敗は無視（下の Alert は出さない） */
        }
        Alert.alert('評価済み', 'この荷物はすでに評価済みです。');
      } else {
        Alert.alert('エラー', '評価の送信に失敗しました。もう一度お試しください。');
      }
    } finally {
      setSubmitting(false);
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={52} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>引き渡し完了！</Text>
          <Text style={styles.heroDesc}>荷物を無事受け取りました</Text>
        </View>

        <Card>
          <Text style={styles.cardSectionTitle}>CO2削減への貢献</Text>
          <View style={styles.co2Row}>
            <Ionicons name="leaf" size={32} color={colors.green} />
            <View style={styles.co2TextWrap}>
              <Text style={styles.co2Value}>{result?.co2Saved ?? 0} kg</Text>
              <Text style={styles.co2Label}>今回のCO2推定削減量</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardSectionTitle}>荷物の情報</Text>
          <InfoRow label="追跡番号" value={result?.trackingNo ?? '—'} />
        </Card>

        {/* 評価フォーム。投稿済みなら「評価済み」を表示、未投稿なら星＋コメントで送信。 */}
        <Card>
          <Text style={styles.cardSectionTitle}>代理人の評価</Text>
          {existingReview ? (
            <View style={styles.reviewedWrap}>
              <View style={styles.starsRow}>
                {Array.from({ length: MAX_RATING }, (_, i) => (
                  <Ionicons
                    key={i}
                    name={i < existingReview.rating ? 'star' : 'star-outline'}
                    size={28}
                    color={colors.green}
                  />
                ))}
              </View>
              {existingReview.comment ? (
                <Text style={styles.reviewedComment}>{existingReview.comment}</Text>
              ) : null}
              <View style={styles.reviewedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={styles.reviewedBadgeText}>評価済み</Text>
              </View>
            </View>
          ) : (
            <View style={styles.formWrap}>
              <Text style={styles.formHint}>代理人の対応はいかがでしたか？</Text>
              <View style={styles.starsRow}>
                {Array.from({ length: MAX_RATING }, (_, i) => {
                  const value = i + 1;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setRating(value)}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={`星${value}`}
                    >
                      <Ionicons
                        name={value <= rating ? 'star' : 'star-outline'}
                        size={36}
                        color={value <= rating ? colors.green : colors.grayLight}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={styles.commentInput}
                placeholder="コメント（任意）"
                placeholderTextColor={colors.grayLight}
                value={comment}
                onChangeText={setComment}
                multiline
                editable={!submitting}
              />
              <PrimaryButton
                label="評価を送信"
                icon="send-outline"
                onPress={handleSubmit}
                loading={submitting}
                disabled={rating < 1}
              />
            </View>
          )}
        </Card>

        <PrimaryButton
          label="ホームへ戻る"
          icon="home-outline"
          onPress={() => router.replace('/(app)/')}
          style={styles.primaryButton}
        />
      </ScrollView>

      <CompletionModal
        visible={showCelebration}
        onClose={() => {
          setShowCelebration(false);
          router.replace('/(app)/');
        }}
        co2Saved={result?.co2Saved ?? 0}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 40, gap: 16 },
  heroSection: { alignItems: 'center', gap: 12, marginBottom: 8 },
  checkCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', shadowColor: colors.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: colors.ink },
  heroDesc: { fontSize: 15, color: colors.gray },
  cardSectionTitle: { fontSize: 13, fontWeight: '600', color: colors.grayLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  co2Row: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.greenLight, borderRadius: 12, padding: 16 },
  co2TextWrap: { gap: 2 },
  co2Value: { fontSize: 28, fontWeight: '800', color: colors.green },
  co2Label: { fontSize: 13, color: colors.greenDark },
  primaryButton: { marginTop: 8 },
  // 評価フォーム
  formWrap: { gap: spacing.md, marginTop: spacing.sm },
  formHint: { fontSize: 14, color: colors.ink },
  starsRow: { flexDirection: 'row', gap: spacing.xs },
  commentInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.fieldBg,
    padding: spacing.md,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  // 投稿済み表示
  reviewedWrap: { gap: spacing.sm, marginTop: spacing.sm },
  reviewedComment: { fontSize: 14, color: colors.ink },
  reviewedBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reviewedBadgeText: { fontSize: 13, fontWeight: '700', color: colors.green },
});
