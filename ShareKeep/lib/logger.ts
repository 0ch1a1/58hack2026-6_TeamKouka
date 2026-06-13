import { getErrorMessage } from './error';

// 開発時のデバッグ用にエラーを一元的に記録する。本番ではここを Sentry 等に差し替える。
export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, getErrorMessage(error));
}
