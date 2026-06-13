import { StatusBadge } from './ui/StatusBadge';
import { colors } from '../lib/theme';

type Props = {
  count?: number;
};

// 機能8: open な報告がある荷物に付ける小バッジ。count を渡すと件数を表示。
// count が 0 / 未指定(0扱い)なら何も描画しない。
export function SupportReportBadge({ count = 0 }: Props) {
  if (count <= 0) return null;
  const label = count > 1 ? `報告 ${count}` : '報告あり';
  return <StatusBadge label={label} color={colors.white} bg={colors.green} icon="alert-circle" />;
}
