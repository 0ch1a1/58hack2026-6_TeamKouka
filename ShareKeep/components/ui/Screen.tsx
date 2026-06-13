import { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { presets } from './styles';

// 全画面共通のルートコンテナ。flex:1 + アプリ背景色（各画面の `safe` スタイルの置き換え）。
// SafeAreaView は react-native-safe-area-context 版を使用（react-native の同名は非推奨で
// Android の safe area を扱えないため）。expo-router がルートで SafeAreaProvider をラップ済み。
// 余白等の上書きは style で。
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SafeAreaView style={[presets.screen, style]}>{children}</SafeAreaView>;
}
