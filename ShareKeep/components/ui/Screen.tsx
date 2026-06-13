import { SafeAreaView, StyleProp, ViewStyle } from 'react-native';
import { presets } from './styles';

// 全画面共通のルートコンテナ。flex:1 + アプリ背景色（各画面の `safe` スタイルの置き換え）。
// 余白等の上書きは style で。
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SafeAreaView style={[presets.screen, style]}>{children}</SafeAreaView>;
}
