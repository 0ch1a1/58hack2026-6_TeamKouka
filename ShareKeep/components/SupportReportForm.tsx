import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import type { SupportCategory } from '../lib/database.types';
import { SUPPORT_CATEGORIES, createSupportReport } from '../features/support';
import { colors, radius, spacing } from '../lib/theme';
import { Card } from './ui/Card';
import { PrimaryButton } from './ui/PrimaryButton';
import { SectionTitle } from './ui/SectionTitle';

type Props = {
  parcelId: string;
  onDone?: () => void;
};

// 機能8: 簡易トラブル報告フォーム。カテゴリを chip で1つ選び、任意メモを添えて送信する。
// 送信中はボタンが loading、成功/失敗は Alert で通知。責任判定はせず記録のみ。
export function SupportReportForm({ parcelId, onDone }: Props) {
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!category || submitting) return;
    setSubmitting(true);
    try {
      await createSupportReport({ parcelId, category, note });
      Alert.alert('報告を受け付けました', 'ご報告ありがとうございます。');
      setCategory(null);
      setNote('');
      onDone?.();
    } catch (e) {
      Alert.alert('送信に失敗しました', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <SectionTitle>トラブルを報告</SectionTitle>

      <View style={styles.chips}>
        {SUPPORT_CATEGORIES.map((c) => {
          const selected = c.value === category;
          return (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setCategory(c.value)}
              disabled={submitting}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        style={styles.input}
        placeholder="メモ（任意）"
        placeholderTextColor={colors.grayLight}
        value={note}
        onChangeText={setNote}
        multiline
        editable={!submitting}
      />

      <PrimaryButton
        label="報告する"
        icon="alert-circle-outline"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!category}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.greenPale, borderColor: colors.green },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.gray },
  chipTextSelected: { color: colors.green },
  input: {
    minHeight: 72,
    borderRadius: radius.button,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'top',
  },
});
