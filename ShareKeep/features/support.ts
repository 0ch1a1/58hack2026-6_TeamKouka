import { supabase } from '../lib/supabase'
import type { SupportCategory, SupportReport } from '../lib/database.types'

// 機能8: 簡易トラブル報告（報告記録のみ）。
// 責任判定・補償はしない。報告の作成・取得のみを担う。
// テーブル support_reports は migration 20260613170200 で定義（本番未適用）。

// カテゴリ定数（値 + 日本語ラベル）。UI の chip と DB の category 値の唯一の正とする。
export const SUPPORT_CATEGORIES: ReadonlyArray<{ value: SupportCategory; label: string }> = [
  { value: 'damaged', label: '破損' },
  { value: 'opened', label: '開封跡' },
  { value: 'wet', label: '濡れ' },
  { value: 'overdue', label: '保管期限切れ' },
  { value: 'lost', label: '紛失' },
  { value: 'other', label: 'その他' },
] as const

// カテゴリ値 → 日本語ラベル。未知の値はそのまま返す（型 string 混入への防御）。
export function supportCategoryLabel(category: SupportCategory | string): string {
  return SUPPORT_CATEGORIES.find((c) => c.value === category)?.label ?? String(category)
}

// 報告を作成。reporter_id は auth.uid()（RLS の insert ポリシーと整合）を埋める。
// note は空白のみなら null に正規化する。失敗時は throw。
export async function createSupportReport(p: {
  parcelId: string
  category: SupportCategory
  note?: string
}): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const note = p.note?.trim()

  const { error } = await supabase.from('support_reports').insert({
    parcel_id: p.parcelId,
    reporter_id: user.id,
    category: p.category,
    note: note ? note : null,
  })

  if (error) throw error
}

// 当該 parcel の報告を created_at 降順で取得。
export async function fetchSupportReports(parcelId: string): Promise<SupportReport[]> {
  const { data, error } = await supabase
    .from('support_reports')
    .select('id, parcel_id, reporter_id, category, status, note, created_at')
    .eq('parcel_id', parcelId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as SupportReport[]
}
