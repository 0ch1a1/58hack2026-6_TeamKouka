import { supabase } from '../lib/supabase'

// 代理人評価機能（F-REVIEW-01）のバックエンド連携層。
// lib/database.types.ts は触らないため、戻り型は本ファイル内に定義する。
// 対応 migration: supabase/migrations/20260613150100_agent_reviews.sql（未適用）。

export type AgentReview = {
  id: string
  parcel_id: string
  agent_id: string
  reviewer_id: string
  rating: number
  comment: string | null
  created_at: string
}

export type AgentRating = {
  avg_rating: number | null
  review_count: number
}

// コメントの最大文字数。DB は comment に上限を設けないため、過大入力はクライアント側で防ぐ。
const COMMENT_MAX_LENGTH = 500

// 評価を投稿。agent_id はクライアント指定せず RPC 側で
// parcels.assigned_agent_id から導出する（受取人が任意指定不可）。
export async function createReview(params: {
  parcelId: string
  rating: number
  comment?: string | null
}) {
  // rating は 1〜5 の整数（DB CHECK rating between 1 and 5 と整合）。
  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
    throw new Error('評価は1〜5の整数で入力してください')
  }

  // comment は任意。指定時は trim して上限を超えないか検証する。
  let comment: string | null = null
  if (params.comment != null) {
    const trimmed = params.comment.trim()
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      throw new Error(`コメントは${COMMENT_MAX_LENGTH}文字以内で入力してください`)
    }
    comment = trimmed === '' ? null : trimmed
  }

  const { data, error } = await supabase.rpc('create_review', {
    p_parcel_id: params.parcelId,
    p_rating: params.rating,
    p_comment: comment,
  })

  if (error) throw error
  return data as AgentReview
}

// 当該荷物に既に投稿済みの評価を取得（未投稿なら null）。
// UNIQUE(parcel_id) のためフォームの出し分けに使う。
export async function fetchReviewForParcel(parcelId: string) {
  const { data, error } = await supabase
    .from('agent_reviews')
    .select('id, parcel_id, agent_id, reviewer_id, rating, comment, created_at')
    .eq('parcel_id', parcelId)
    .maybeSingle()

  if (error) throw error
  return data as AgentReview | null
}

// 代理人の平均評価・件数を取得（RPC get_agent_rating）。
export async function getAgentRating(agentId: string) {
  const { data, error } = await supabase.rpc('get_agent_rating', {
    p_agent_id: agentId,
  })

  if (error) throw error
  // RPC は returns table のため配列で返る。0件でも1行（avg null/count 0）想定だが防御的に既定値。
  const row = Array.isArray(data) ? data[0] : data
  return (row ?? { avg_rating: null, review_count: 0 }) as AgentRating
}
