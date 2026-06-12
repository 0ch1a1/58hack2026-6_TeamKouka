# React Native から Supabase Database を扱う実装ガイド

このドキュメントは、Supabase 側で次のリソースが作成済みである前提で、React Native / Expo アプリから接続するための手順をまとめたものです。

- Tables: `profiles`, `parcels`, `parcel_status_histories`, `qr_tokens`
- SQL Functions: `update_parcel_status`, `generate_qr_token`, `find_nearby_agents`
- Edge Functions: `verify-agent-qr`, `verify-recipient-qr`
- Security: 各 Table の RLS policy

## 1. 全体像

### 1.1 接続の階層

```text
React Native / Expo app
  └─ @supabase/supabase-js
      ├─ Supabase Auth
      │   └─ profiles table
      ├─ Supabase Database
      │   ├─ parcels table
      │   ├─ parcel_status_histories table
      │   └─ qr_tokens table
      ├─ RPC
      │   ├─ update_parcel_status
      │   ├─ generate_qr_token
      │   └─ find_nearby_agents
      ├─ Edge Functions
      │   ├─ verify-agent-qr
      │   └─ verify-recipient-qr
      └─ Realtime
          └─ parcels の変更購読
```

### 1.2 フロントエンドに置いてよいキー

React Native アプリに置いてよいキーは `publishable key` です。

`service_role` や `secret key` は絶対に React Native アプリへ入れないでください。QR 検証、ポイント付与、CO2 計算など、ユーザーに直接実行させたくない処理は Edge Functions か RLS で保護された SQL Function に寄せます。

## 2. React Native 環境を作る

### 2.1 Expo + TypeScript プロジェクトを作成する

```powershell
npx create-expo-app -t expo-template-blank-typescript sharekeep-app
cd sharekeep-app
```

### 2.2 Supabase 接続に必要な package を入れる

```powershell
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

### 2.3 QR 機能に必要な package を入れる

QR を表示、読み取りする場合は次も追加します。

```powershell
npx expo install expo-camera
npm install react-native-qrcode-svg
```

## 3. 環境変数を設定する

### 3.1 Supabase の接続情報を取得する

Supabase Dashboard の `Connect` または `Project Settings > API Keys` から次を取得します。

- Project URL
- Publishable key

### 3.2 `.env` を作成する

```env
EXPO_PUBLIC_SUPABASE_URL=https://zbmrmblakoszzecdnptn.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

古いプロジェクトで `anon key` しか表示されない場合は、一時的に `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` に anon key を入れても動きます。ただし、新規実装では publishable key を優先してください。

## 4. Supabase Client を作る

### 4.1 ファイル配置

```text
lib/
  └─ supabase.ts
```

### 4.2 `lib/supabase.ts`

```ts
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
})

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
```

## 5. 機能別の実装

## 5.1 Auth と profile

### 5.1.1 役割

```text
Supabase Auth user
  └─ profiles row
      ├─ id: auth.users.id
      ├─ role
      ├─ full_name
      └─ phone
```

Supabase Auth にユーザーを作成し、その `user.id` を `profiles.id` に入れます。

### 5.1.2 サインアップ

```ts
import { supabase } from '../lib/supabase'

export async function signUpRecipient(params: {
  email: string
  password: string
  fullName: string
  phone?: string
}) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
  })

  if (error) throw error
  if (!data.user) throw new Error('ユーザー作成に失敗しました')

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    role: 'recipient',
    full_name: params.fullName,
    phone: params.phone ?? null,
  })

  if (profileError) throw profileError

  return data.user
}
```

### 5.1.3 ログイン

```ts
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data.session
}
```

## 5.2 荷物

### 5.2.1 荷物作成の責務

`parcels.tracking_no` は Supabase 側の Trigger で自動採番される想定です。そのため、フロントエンドからは送らなくてよいです。

```text
createParcel()
  └─ parcels insert
      ├─ recipient_id
      └─ delivery_company_id
```

### 5.2.2 荷物を登録する

```ts
export async function createParcel(params: {
  recipientId: string
  deliveryCompanyId: string
}) {
  const { data, error } = await supabase
    .from('parcels')
    .insert({
      recipient_id: params.recipientId,
      delivery_company_id: params.deliveryCompanyId,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}
```

### 5.2.3 自分の荷物一覧を取得する

受取人本人の荷物を表示する例です。RLS が有効なら、見えてよい行だけが返ります。

```ts
export async function fetchMyParcels(userId: string) {
  const { data, error } = await supabase
    .from('parcels')
    .select(`
      id,
      tracking_no,
      status,
      retry_count,
      co2_saved_kg,
      created_at,
      updated_at
    `)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}
```

## 5.3 荷物ステータス

### 5.3.1 更新の責務

履歴を残すため、`parcels` を直接 `update()` するより `update_parcel_status` Function を呼びます。

```text
updateParcelStatus()
  └─ rpc('update_parcel_status')
      ├─ parcels.status を更新
      └─ parcel_status_histories に履歴を追加
```

### 5.3.2 ステータスを更新する

```ts
export async function updateParcelStatus(parcelId: string, status: string) {
  const { error } = await supabase.rpc('update_parcel_status', {
    p_parcel_id: parcelId,
    p_status: status,
  })

  if (error) throw error
}
```

### 5.3.3 呼び出し例

```ts
await updateParcelStatus(parcelId, 'delivery_failed')
await updateParcelStatus(parcelId, 'agent_assigned')
await updateParcelStatus(parcelId, 'completed')
```

## 5.4 QR トークン

### 5.4.1 発行の責務

SQL Function `generate_qr_token` がある前提です。

```text
generateQrToken()
  └─ rpc('generate_qr_token')
      └─ qr_tokens に検証用 token を保存
```

### 5.4.2 QR トークンを発行する

```ts
export async function generateQrToken(params: {
  parcelId: string
  userId: string
  qrType: 'agent' | 'recipient'
}) {
  const { data, error } = await supabase.rpc('generate_qr_token', {
    p_parcel_id: params.parcelId,
    p_user_id: params.userId,
    p_qr_type: params.qrType,
  })

  if (error) throw error
  return data as string
}
```

### 5.4.3 QR を表示する

```tsx
import QRCode from 'react-native-qrcode-svg'

export function QrTokenView({ token }: { token: string }) {
  return <QRCode value={token} size={220} />
}
```

## 5.5 Edge Functions

### 5.5.1 使う場面

QR 検証のように、アプリから直接 DB 更新させたくない処理は Edge Function に寄せます。

```text
QR scan
  └─ Edge Function
      ├─ token を検証
      ├─ 必要な DB 更新を実行
      └─ success / error を返す
```

### 5.5.2 代理人 QR を検証する

```ts
export async function verifyAgentQr(token: string) {
  const { data, error } = await supabase.functions.invoke('verify-agent-qr', {
    body: { token },
  })

  if (error) throw error
  return data as { success: boolean; error?: unknown }
}
```

### 5.5.3 受取人 QR を検証する

```ts
export async function verifyRecipientQr(token: string) {
  const { data, error } = await supabase.functions.invoke('verify-recipient-qr', {
    body: { token },
  })

  if (error) throw error
  return data as { success: boolean; error?: unknown }
}
```

## 5.6 近くの代理人

### 5.6.1 検索の責務

`find_nearby_agents` Function を使って、位置情報から近くの代理人を探します。

```text
findNearbyAgents()
  └─ rpc('find_nearby_agents')
      ├─ p_lat
      ├─ p_lng
      └─ p_radius_m
```

### 5.6.2 近くの代理人を取得する

```ts
export async function findNearbyAgents(params: {
  latitude: number
  longitude: number
  radiusMeters?: number
}) {
  const { data, error } = await supabase.rpc('find_nearby_agents', {
    p_lat: params.latitude,
    p_lng: params.longitude,
    p_radius_m: params.radiusMeters ?? 50,
  })

  if (error) throw error
  return data
}
```

## 5.7 Realtime

### 5.7.1 購読の責務

配送状態が変わったら画面を自動更新したい場合に使います。

```text
subscribeParcel()
  └─ channel('parcel:{parcelId}')
      └─ public.parcels の対象 row を購読
```

### 5.7.2 荷物更新を購読する

```ts
export function subscribeParcel(parcelId: string, onChange: () => void) {
  const channel = supabase
    .channel(`parcel:${parcelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'parcels',
        filter: `id=eq.${parcelId}`,
      },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
```

## 6. MVP で作る画面

### 6.1 画面の親子関係

```text
App
  ├─ AuthScreen
  └─ MainStack
      ├─ HomeScreen
      │   └─ ParcelDetailScreen
      │       ├─ QrTokenView
      │       └─ QrScanScreen
      └─ AgentScreen
```

### 6.2 画面ごとの役割

| Screen | 役割 | 主に使う処理 |
| --- | --- | --- |
| `AuthScreen` | サインアップ、ログイン | `signUpRecipient`, `signIn` |
| `HomeScreen` | 自分の荷物一覧 | `fetchMyParcels` |
| `ParcelDetailScreen` | 荷物詳細、ステータス、QR 表示 | `subscribeParcel`, `generateQrToken` |
| `AgentScreen` | 代理人情報、ポイント、対応中荷物 | `findNearbyAgents` など |
| `QrScanScreen` | QR 読み取り、検証 | `verifyAgentQr`, `verifyRecipientQr` |

## 7. 動かないときの確認リスト

### 7.1 環境変数

- `EXPO_PUBLIC_SUPABASE_URL` が正しい
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` が正しい
- アプリを再起動して `.env` が読み込まれている

### 7.2 認証と RLS

- `profiles.id` と `auth.users.id` が一致している
- 対象ユーザーに `select`, `insert`, `update` の RLS policy がある
- `service_role` や `secret key` をフロントエンドに置いていない

### 7.3 Database / RPC

- `rpc()` の引数名が SQL Function の引数名と一致している
- 対象 schema / table が Data API の公開対象になっている
- Edge Function の名前が Dashboard 側の関数名と一致している

## 8. 最初に実装する順番

最初は次の 3 ファイルから作ると、DB 接続の疎通確認がしやすいです。

```text
lib/supabase.ts
features/auth.ts
features/parcels.ts
```

実装順は次がおすすめです。

1. `lib/supabase.ts` で Supabase Client を作る
2. `features/auth.ts` でログインできる状態にする
3. `features/parcels.ts` で荷物作成と一覧取得を確認する
4. QR、Realtime、位置情報、Edge Functions を順に追加する
