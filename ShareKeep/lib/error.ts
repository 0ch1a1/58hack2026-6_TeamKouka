// エラーメッセージ抽出ロジックの統合先。
// 複数箇所（features/auth・features/parcels-agent）に散在していた抽出関数を
// 振る舞いを変えずに集約する。各関数の入出力仕様は下記コメントの通り。

// 任意の throw 値からユーザー/ログ向けの文字列を取り出す。
// - Error なら error.message
// - object なら message / error_description / details / hint / code を
//   この順で拾い、空でないものを '\n' で連結。
//   1つも無ければ JSON.stringify（失敗時は String(error)）
// - それ以外は String(error)
export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown
      error_description?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }

    const parts = [
      maybeError.message,
      maybeError.error_description,
      maybeError.details,
      maybeError.hint,
      maybeError.code ? `code: ${String(maybeError.code)}` : undefined,
    ].filter(Boolean)

    if (parts.length > 0) return parts.map(String).join('\n')

    try {
      return JSON.stringify(error, null, 2)
    } catch {
      return String(error)
    }
  }

  return String(error)
}

// Edge Function 応答が { success: false } 形式の失敗かどうかを判定する。
export function isFunctionFailure(data: unknown): data is { success: false; error?: unknown } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    (data as { success?: unknown }).success === false
  )
}

// Edge Function 呼び出し（supabase.functions.invoke）のエラー文字列を取り出す。
// レスポンス本文 data の { error } を最優先し、無ければ invoke の error 引数へフォールバックする。
// - data が { error } を持つ object なら String(data.error)
// - そうでなく error が Error なら error.message
// - それ以外は String(error)
export function getFunctionErrorMessage(error: unknown, data: unknown) {
  if (data && typeof data === 'object' && 'error' in data) {
    return String((data as { error: unknown }).error)
  }

  if (error instanceof Error) return error.message

  return String(error)
}
