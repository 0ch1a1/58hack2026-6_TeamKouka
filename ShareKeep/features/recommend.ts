import { supabase } from '../lib/supabase'

// 推薦スコアリング連携層。距離・時間帯・実績などを合算したスコアで中間者(代理人)候補を
// 並べる Python ML サービス（recommendation-service）を叩く。
// 設計・契約の正本は maki-docs/recommendation-api.md / recommendation-next-steps.md。
//
// レスポンス型は recommendation-service の schemas.py（RecommendResponse / RecommendationItem）に合わせる。

// `breakdown` は特徴量名 → 0〜1 のスコア寄与（例: distance_score / time_score / ...）。
// キーはモデル次第で増減しうるため固定 union にせず Record で受ける。
export type RecommendationBreakdown = Record<string, number>

export type RecommendedAgent = {
  agent_id: string
  full_name: string | null
  rank: number
  score: number
  distance_meters: number
  breakdown: RecommendationBreakdown
  reasons: string[]
}

export type RecommendResponse = {
  model_version: string
  generated_at: string
  recommendations: RecommendedAgent[]
}

// サービス URL（デプロイ先）。未デプロイ時は未設定 → isRecommendationEnabled() が false。
// 呼び出し側は false の場合に既存の自動マッチ（matchNearbyAgent）へフォールバックする。
const RECOMMENDATION_URL = process.env.EXPO_PUBLIC_RECOMMENDATION_URL

// 推薦サービスが利用可能か（URL が設定済みか）。UI のフォールバック判定に使う。
export function isRecommendationEnabled(): boolean {
  return Boolean(RECOMMENDATION_URL)
}

// 候補をスコア順で取得（Python ML サービス）。
// 起点は latitude/longitude を優先、無ければ recipientId からサーバが解決する（recommendation-api.md §1.5）。
export async function recommendAgents(params: {
  parcelId?: string
  recipientId?: string
  latitude?: number
  longitude?: number
  radiusMeters?: number
  topK?: number
  targetAt?: string
}): Promise<RecommendedAgent[]> {
  if (!RECOMMENDATION_URL) {
    throw new Error('EXPO_PUBLIC_RECOMMENDATION_URL が未設定です')
  }

  // 末尾スラッシュの有無で // にならないよう正規化。
  const base = RECOMMENDATION_URL.replace(/\/+$/, '')

  // undefined のキーは JSON.stringify が落とすため、サーバ側 default（radius_m=2000 等）が効く。
  const res = await fetch(`${base}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parcel_id: params.parcelId,
      recipient_id: params.recipientId,
      latitude: params.latitude,
      longitude: params.longitude,
      radius_m: params.radiusMeters,
      top_k: params.topK,
      target_at: params.targetAt,
    }),
  })

  if (!res.ok) {
    // FastAPI は {detail: string} 形式でエラーを返す。取れれば本文を優先。
    let message = `推薦の取得に失敗しました (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (body?.detail) message = String(body.detail)
    } catch {
      // 本文が JSON でない場合はステータスのみのメッセージのまま
    }
    throw new Error(message)
  }

  const data = (await res.json()) as RecommendResponse
  // agent_id は UUID（string）想定だが、念のため string 化して UI/RPC で安全に扱う。
  return (data.recommendations ?? []).map((item) => ({
    ...item,
    agent_id: String(item.agent_id),
  }))
}

// 受取人が中間者を確定したら選択ラベルを記録（再学習の教師ラベルA）。
// DB 側 RPC（security definer）で、その parcel の推薦ログに chosen を立てる。
export async function markRecommendationChosen(parcelId: string, agentId: string) {
  const { error } = await supabase.rpc('mark_recommendation_chosen', {
    p_parcel_id: parcelId,
    p_agent_id: agentId,
  })

  if (error) throw error
}
