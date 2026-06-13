import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { ScreenHeader, Card, PrimaryButton } from '../../../components/ui';
import {
  upsertRecipientProfile,
  fetchRecipientHome,
} from '../../../features/parcels-recipient';

// 受取人の自宅住所（距離の起点）を登録する画面。
// 主動線: 端末GPSの現在地を自宅として登録（Expo Go でも動く・確実）。
// 副動線: 入力した住所をジオコーディングして登録（dev build/実機のみ。Expo Go/Web 不可）。
export default function HomeAddressScreen() {
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGps, setSavingGps] = useState(false);
  const [savingGeocode, setSavingGeocode] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const home = await fetchRecipientHome(user.id);
        if (!cancelled && home) {
          setAddress(home.address ?? '');
          setAddressDetail(home.address_detail ?? '');
          setRegistered(Boolean(home.address));
        }
      } catch {
        // 取得失敗は無視（未登録扱いで新規入力できる）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (latitude: number, longitude: number, addressText: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('エラー', 'ログイン情報を確認できませんでした。');
      return false;
    }
    await upsertRecipientProfile({
      userId: user.id,
      address: addressText,
      addressDetail: addressDetail.trim() || null,
      latitude,
      longitude,
    });
    return true;
  };

  // 現在地を自宅として登録（確実な主動線）
  const handleRegisterCurrentLocation = async () => {
    if (savingGps || savingGeocode) return;
    setSavingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('位置情報の許可が必要です', '現在地を自宅として登録するには位置情報の利用を許可してください。');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = position.coords;

      // 住所未入力なら逆ジオコーディングで補完（失敗しても登録は続行）
      let label = address.trim();
      if (!label) {
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (place) {
            label = [place.region, place.city, place.street, place.name]
              .filter(Boolean)
              .join('');
          }
        } catch {
          // 逆ジオコーディング不可（Expo Go 等）。ラベルは既定文言にする。
        }
      }
      if (!label) label = '現在地（自宅）';

      const ok = await save(latitude, longitude, label);
      if (ok) {
        setAddress(label);
        setRegistered(true);
        Alert.alert('登録しました', '現在地を自宅として登録しました。');
      }
    } catch {
      Alert.alert('エラー', '現在地の取得・登録に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSavingGps(false);
    }
  };

  // 入力した住所をジオコーディングして登録（dev build/実機のみ）
  const handleRegisterFromAddress = async () => {
    if (savingGps || savingGeocode) return;
    const query = address.trim();
    if (!query) {
      Alert.alert('住所を入力してください', '登録する住所を入力してから実行してください。');
      return;
    }
    setSavingGeocode(true);
    try {
      // Android ではジオコーディング前に権限が必要
      await Location.requestForegroundPermissionsAsync();
      const results = await Location.geocodeAsync(query);
      const first = results[0];
      if (!first) {
        Alert.alert('住所が見つかりません', '住所を具体的に入力するか、「現在地を自宅として登録」をお試しください。');
        return;
      }
      const ok = await save(first.latitude, first.longitude, query);
      if (ok) {
        setRegistered(true);
        Alert.alert('登録しました', '入力した住所を自宅として登録しました。');
      }
    } catch {
      // Expo Go / Web ではジオコーディング不可
      Alert.alert(
        '住所からの登録に失敗しました',
        'この端末では住所検索が使えない場合があります。「現在地を自宅として登録」をお試しください。',
      );
    } finally {
      setSavingGeocode(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="自宅住所の登録" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="home-outline" size={40} color={colors.green} />
        </View>
        <Text style={styles.lead}>
          自宅を登録すると、いまいる場所に関係なく{'\n'}
          自宅の近所の代理人をおすすめできます。
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />
        ) : (
          <>
            {registered && (
              <View style={styles.registeredBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={styles.registeredText}>登録済み</Text>
              </View>
            )}

            <Card style={styles.card}>
              <Text style={styles.label}>住所</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 東京都渋谷区〇〇 1-2-3"
                placeholderTextColor={colors.grayLight}
                value={address}
                onChangeText={setAddress}
                autoCapitalize="none"
              />
              <Text style={styles.label}>建物名・部屋番号（任意）</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 〇〇マンション 101"
                placeholderTextColor={colors.grayLight}
                value={addressDetail}
                onChangeText={setAddressDetail}
                autoCapitalize="none"
              />
            </Card>

            <PrimaryButton
              label="現在地を自宅として登録"
              icon="location-outline"
              onPress={handleRegisterCurrentLocation}
              loading={savingGps}
              disabled={savingGeocode}
            />
            <Text style={styles.orText}>または</Text>
            <PrimaryButton
              label="入力した住所で登録"
              icon="search-outline"
              onPress={handleRegisterFromAddress}
              loading={savingGeocode}
              disabled={savingGps}
              style={styles.secondaryBtn}
            />
            <Text style={styles.note}>
              ※「現在地を自宅として登録」は自宅にいるときに押してください。{'\n'}
              住所検索は一部の端末では使えない場合があります。
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 14, alignItems: 'stretch' },
  iconWrap: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  lead: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 22 },
  registeredBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: colors.greenPale, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  registeredText: { fontSize: 13, fontWeight: '700', color: colors.green },
  card: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.gray },
  input: { height: 50, backgroundColor: colors.fieldBg, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.border },
  orText: { textAlign: 'center', fontSize: 13, color: colors.grayLight },
  secondaryBtn: { backgroundColor: colors.greenDark },
  note: { fontSize: 12, color: colors.grayLight, lineHeight: 18, marginTop: 4 },
});
