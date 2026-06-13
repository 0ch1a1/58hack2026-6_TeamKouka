import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from './Avatar';
import { uploadAgentAvatar, removeAgentAvatar } from '../features/avatar';
import { colors } from '../lib/theme';

// 機能7': 代理人の顔写真の登録/撮影/削除。任意項目（未設定でも保存可）。
// 表示は親が渡す displayUri（署名URL や選択直後のローカルURI）を Avatar に流す。
// 登録/削除が成功したら onChanged を呼び、親に再取得（署名URL更新）を促す。
type Props = {
  userId: string;
  // 現在の表示用URI（署名URL等）。未設定なら頭文字プレースホルダ。
  displayUri?: string | null;
  name?: string | null;
  // 登録/削除の成否を親に通知（成功時のみ）。登録時はアップロード済みパスを渡す。
  onChanged?: (path: string | null) => void;
};

export function AvatarPicker({ userId, displayUri, name, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  // 選択直後はローカルURIを即時表示し、親の署名URL再取得を待たずに反映する。
  const [localUri, setLocalUri] = useState<string | null>(null);

  const shownUri = localUri ?? displayUri ?? null;

  const handleUpload = async (uri: string) => {
    setBusy(true);
    try {
      const path = await uploadAgentAvatar(userId, uri);
      setLocalUri(uri);
      onChanged?.(path);
    } catch {
      Alert.alert('エラー', '写真のアップロードに失敗しました。時間をおいて再度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('権限が必要です', '写真を選ぶには、設定アプリで写真へのアクセスを許可してください。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await handleUpload(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('権限が必要です', '写真を撮影するには、設定アプリでカメラへのアクセスを許可してください。');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await handleUpload(result.assets[0].uri);
  };

  const handleRemove = () => {
    Alert.alert('写真を外す', '登録した顔写真を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '外す',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await removeAgentAvatar(userId);
            setLocalUri(null);
            onChanged?.(null);
          } catch {
            Alert.alert('エラー', '写真の削除に失敗しました。');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        <Avatar uri={shownUri} name={name} size={96} />
        {busy && (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </View>

      <Text style={styles.hint}>顔写真は任意です。登録すると受取人に表示され、安心感につながります。</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={takePhoto} disabled={busy}>
          <Ionicons name="camera-outline" size={20} color={colors.green} />
          <Text style={styles.actionText}>撮影</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={pickFromLibrary} disabled={busy}>
          <Ionicons name="image-outline" size={20} color={colors.green} />
          <Text style={styles.actionText}>写真を選ぶ</Text>
        </TouchableOpacity>
      </View>

      {shownUri && (
        <TouchableOpacity onPress={handleRemove} disabled={busy} style={styles.removeBtn}>
          <Text style={styles.removeText}>写真を外す</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  avatarWrap: { width: 96, height: 96 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.green,
    backgroundColor: colors.white,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.green },
  removeBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  removeText: { fontSize: 14, color: '#EF4444', fontWeight: '600' },
});
