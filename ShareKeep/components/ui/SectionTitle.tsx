import { Text, StyleProp, TextStyle } from 'react-native';
import { presets } from './styles';

// カード内/セクションの小見出し（大文字・字間広め）。各画面の `sectionTitle`/`cardSectionTitle` の置き換え。
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[presets.sectionTitle, style]}>{children}</Text>;
}
