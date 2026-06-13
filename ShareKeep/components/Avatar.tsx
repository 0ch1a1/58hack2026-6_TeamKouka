import { View, Image, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

// 機能7': 代理人の顔写真表示。uri があれば画像、無ければ頭文字プレースホルダ。
// 署名URLの取得・登録は features/avatar.ts 側で行い、ここは純表示に徹する。
type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

// 名前の先頭1文字（無ければ「?」）。サロゲートペア混在を避けるため Array.from で先頭要素を取る。
function initial(name?: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0];
}

export function Avatar({ uri, name, size = 48 }: Props) {
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, dim]}
        accessibilityLabel={name ? `${name}の写真` : 'プロフィール写真'}
      />
    );
  }

  return (
    <View style={[styles.placeholder, dim]} accessibilityLabel={name ? `${name}のアイコン` : 'プロフィールアイコン'}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.greenPale },
  placeholder: {
    backgroundColor: colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: colors.green, fontWeight: '700' },
});
