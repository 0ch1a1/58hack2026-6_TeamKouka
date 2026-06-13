import * as Crypto from 'expo-crypto';
import type { ParcelEvent, ParcelEventType } from './database.types';

// 機能9: 追記専用監査ログ（append-only ハッシュチェーン）の純ロジック層。
// I/O（DB / ネットワーク）は持たない。ハッシュ計算とチェーン検証だけを行う。
//
// 正直な保証範囲（MVP の限界）:
//   ハッシュはクライアント（expo-crypto）で計算する。これは「内部の誤操作・後付け
//   改変の検知補助」であり「改ざん不能」ではない。DB の所有者 / service_role は
//   トリガ・RLS を回避し、全 hash を再計算すれば整合を保ったまま書き換えできる。
//   真の改ざん検知には外部アンカリング（最新ハッシュの外部公開）や分散保持が必要だが
//   ハッカソンではやらない。入力イベントが偽造されればチェーンは「偽データの正しい
//   チェーン」になるだけで、真正性は別機能（署名QR）に依存する。

// ハッシュ計算の入力。created_at はサーバ確定 ISO8601 文字列をそのまま使う。
// payload_text はクライアントが確定した生文字列をそのまま使い、再シリアライズしない。
export type HashInput = {
  // 直前イベントの hash。チェーン先頭は null（先頭は空文字として連結）。
  prevHash: string | null;
  // parcel_id。DB 上は null 許容だが、ハッシュ連結では空文字に正規化する。
  parcelId: string | null;
  eventType: ParcelEventType | string;
  // actor_id。DB 上は null 許容だが、ハッシュ連結では空文字に正規化する。
  actorId: string | null;
  // サーバ確定の created_at（ISO8601）。
  createdAt: string;
  // ハッシュ対象の生文字列。
  payloadText: string;
};

// チェーン検証の 1 行分の結果。
export type ChainVerifyResult = {
  index: number;
  // この行の hash 再計算 ＋ prev_hash 連結（先頭以外）が両方一致すれば true。
  ok: boolean;
  // 配列全体で最初に壊れた index（壊れていなければ null）。各要素に同じ値が入る。
  firstBrokenIndex: number | null;
};

// 区切り文字。payload_text 中に '|' が含まれても、各フィールドの順序・個数は固定なので
// 連結文字列の構造は一意（payload_text は常に末尾の 1 フィールド）。
const SEP = '|';

// 連結対象フィールドを構築する。null は空文字に正規化（DB の NULL 先頭ハッシュと整合）。
function buildMessage(input: HashInput): string {
  return [
    input.prevHash ?? '',
    input.parcelId ?? '',
    input.eventType,
    input.actorId ?? '',
    input.createdAt,
    input.payloadText,
  ].join(SEP);
}

// hash = sha256( prevHash | parcelId | eventType | actorId | createdAt | payloadText )
// 区切りは '|'。prevHash が null なら空文字として連結する。
export async function computeHash(input: HashInput): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    buildMessage(input)
  );
}

// 1 行を ParcelEvent から再計算するためのアダプタ。
function inputFromEvent(event: ParcelEvent): HashInput {
  return {
    prevHash: event.prev_hash,
    parcelId: event.parcel_id,
    eventType: event.event_type,
    actorId: event.actor_id,
    createdAt: event.created_at,
    payloadText: event.payload_text,
  };
}

// チェーンを検証する。events は created_at 昇順である前提。
// 各行について:
//   1. hash を再計算し、保存済み hash と突合
//   2. 先頭以外は events[i].prev_hash === events[i-1].hash を確認
// どちらかが不一致なら ok=false。最初に壊れた index を firstBrokenIndex に入れる。
export async function verifyChain(
  events: ParcelEvent[]
): Promise<ChainVerifyResult[]> {
  // 各行の hash 再計算は並列でよい（行間の依存は prev_hash の突合のみで別途行う）。
  const recomputed = await Promise.all(
    events.map((e) => computeHash(inputFromEvent(e)))
  );

  const oks: boolean[] = events.map((event, i) => {
    const hashMatches = recomputed[i] === event.hash;
    // 先頭は prev_hash が null（または空相当）であることを期待。それ以外は前行 hash と一致。
    const linkMatches =
      i === 0
        ? event.prev_hash == null || event.prev_hash === ''
        : event.prev_hash === events[i - 1].hash;
    return hashMatches && linkMatches;
  });

  const firstBroken = oks.findIndex((ok) => !ok);
  const firstBrokenIndex = firstBroken === -1 ? null : firstBroken;

  return events.map((_event, index) => ({
    index,
    ok: oks[index],
    firstBrokenIndex,
  }));
}
