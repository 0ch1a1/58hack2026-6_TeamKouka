import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { ParcelEvent, ParcelEventType } from '../lib/database.types';
import { computeHash } from '../lib/parcelEventsHash';

// 機能9: 追記専用監査ログ（append-only ハッシュチェーン）のバックエンド連携層。
// 対応 migration: supabase/migrations/20260613200100_parcel_events.sql（本番未適用）。
//
// MVP はハッシュをクライアント計算（expo-crypto）で append する。これは「内部の誤操作・
// 後付け改変の検知補助」であって「改ざん不能」ではない（運営権限による全 hash 再計算は
// 防げない）。詳細は lib/parcelEventsHash.ts の注記を参照。
//
// 競合に関する注意: 仕様の正本（complete-delivery Edge Function）はサーバ側で
// SELECT ... FOR UPDATE による行ロックで prev_hash 取得と INSERT を直列化する。
// 本 MVP はクライアント計算のため、最新 hash 取得と INSERT の間に他クライアントの
// append が割り込むと prev_hash が古くなりうる（チェーン分岐）。デモ用途では単一操作者を
// 前提とし許容する。将来は Edge Function 化で解消する。

// created_at 昇順で当該 parcel のイベントを取得する。検証 UI のチェーン突合に使う。
export async function fetchParcelEvents(parcelId: string): Promise<ParcelEvent[]> {
  const { data, error } = await supabase
    .from('parcel_events')
    .select(
      'id, parcel_id, event_type, actor_id, client_event_id, payload_text, payload, prev_hash, hash, created_at'
    )
    .eq('parcel_id', parcelId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ParcelEvent[];
}

// チェーン末尾（最新）の hash を取得。先頭イベントなら null。
async function fetchLatestHash(parcelId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('parcel_events')
    .select('hash')
    .eq('parcel_id', parcelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as { hash: string } | null)?.hash ?? null;
}

export type AppendParcelEventParams = {
  parcelId: string;
  eventType: ParcelEventType;
  // ハッシュ対象の生文字列（任意）。未指定時は '{}'（DB DEFAULT と整合）。
  payload?: Record<string, unknown> | null;
  // 冪等キー（任意）。同一の論理イベントを再送する可能性がある呼び出し側は、
  // 安定した clientEventId を渡すこと（タイムアウト/レスポンス喪失時の再送で
  // 23505 冪等パスに乗る）。未指定なら都度新規採番する＝再送では別イベント挿入になる。
  clientEventId?: string;
};

export type AppendParcelEventResult = {
  event: ParcelEvent;
  // 冪等ヒット（同一 client_event_id が既に存在し、既処理とみなした）か否か。
  idempotentHit: boolean;
};

// イベントを 1 件追記する。
//   - 最新イベントの hash を prev_hash にする
//   - client_event_id をクライアント採番（uuid, 冪等キー）
//   - created_at はクライアント確定の ISO8601（MVP。サーバ確定値ではない点は限界）
//   - computeHash して insert
//   - 同一 client_event_id の UNIQUE 衝突は「既処理」とみなし既存行を返す（冪等）
//
// 注: 本来 created_at はサーバ確定値を採用すべきだが、MVP では INSERT 値を確定するため
// クライアントで採番し、その同じ値をハッシュに使う（保存値とハッシュ入力を一致させる）。
export async function appendParcelEvent(
  params: AppendParcelEventParams
): Promise<AppendParcelEventResult> {
  const { parcelId, eventType } = params;

  // actor は認証ユーザ本人（RLS insert ポリシー: actor_id = auth.uid()）。
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const actorId = userData.user?.id ?? null;
  if (!actorId) throw new Error('ログインが必要です');

  // ハッシュ対象の生文字列。payload を JSON 文字列化したものを payload_text とし、
  // payload(jsonb) には同じ内容を照会用に格納する（ハッシュには payload_text のみ使用）。
  const payload = params.payload ?? null;
  const payloadText = payload == null ? '{}' : JSON.stringify(payload);

  // 呼び出し側が安定IDを渡せば冪等（再送で 23505 パス）。未指定は都度新規採番。
  const clientEventId = params.clientEventId ?? Crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const prevHash = await fetchLatestHash(parcelId);

  const hash = await computeHash({
    prevHash,
    parcelId,
    eventType,
    actorId,
    createdAt,
    payloadText,
  });

  const { data, error } = await supabase
    .from('parcel_events')
    .insert({
      parcel_id: parcelId,
      event_type: eventType,
      actor_id: actorId,
      client_event_id: clientEventId,
      payload_text: payloadText,
      payload,
      prev_hash: prevHash,
      hash,
      created_at: createdAt,
    })
    .select(
      'id, parcel_id, event_type, actor_id, client_event_id, payload_text, payload, prev_hash, hash, created_at'
    )
    .single();

  if (error) {
    // 23505 = unique_violation。client_event_id 衝突 = 既処理とみなし既存行を返す（冪等）。
    if ((error as { code?: string }).code === '23505') {
      const { data: existing, error: fetchError } = await supabase
        .from('parcel_events')
        .select(
          'id, parcel_id, event_type, actor_id, client_event_id, payload_text, payload, prev_hash, hash, created_at'
        )
        .eq('client_event_id', clientEventId)
        .single();
      if (fetchError) throw fetchError;
      return { event: existing as ParcelEvent, idempotentHit: true };
    }
    throw error;
  }

  return { event: data as ParcelEvent, idempotentHit: false };
}
