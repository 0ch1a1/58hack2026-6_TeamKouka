// 共有デザイントークン。各画面でハードコードされていた色・影・角丸を集約。
export const colors = {
  green: '#1A7A4C',
  greenLight: '#D1FAE5',
  greenPale: '#E8F5E9',
  greenDark: '#059669',
  driver: '#4B5563',
  bg: '#F0FAF4',
  white: '#FFFFFF',
  ink: '#111827',
  gray: '#6B7280',
  grayLight: '#9CA3AF',
  fieldBg: '#F9FAFB',
  border: '#D1FAE5',
} as const;

// カード等で多用される標準シャドウ。
export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const radius = {
  card: 16,
  button: 14,
} as const;
