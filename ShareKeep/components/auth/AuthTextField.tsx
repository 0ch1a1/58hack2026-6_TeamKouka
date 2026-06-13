import { TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors } from '../../lib/theme';

// 認証フォーム共通のテキスト入力。プレースホルダ色は固定、その他は TextInput と同じ props を透過。
export function AuthTextField({ style, ...props }: TextInputProps) {
  return <TextInput style={[styles.input, style]} placeholderTextColor={colors.grayLight} {...props} />;
}

const styles = StyleSheet.create({
  input: {
    width: '100%',
    height: 52,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
