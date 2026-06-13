import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { geocodeAgentAddress } from '../../../features/parcels';
import { colors } from '../../../lib/theme';
import { ScreenHeader, PrimaryButton, Card } from '../../../components/ui';

const DAYS = ['月', '火', '水', '木', '金', '土', '日'] as const;
type Day = (typeof DAYS)[number];

export default function AgentProfileScreen() {
  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('agent_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        // geocode-agent-address は address（ジオコ結果の display_name で上書き）と
        // address_detail（部屋番号等）を分けて保存する。旧 '郵便番号|住所|部屋' 連結は廃止。
        // 郵便番号は display_name から確実に復元できないため、住所欄は保存済み address をそのまま表示する。
        setAddress(data.address ?? '');
        setRoomNumber(data.address_detail ?? '');
        setSelectedDays((data.available_days ?? []) as Day[]);
        setTimeFrom(data.start_time?.slice(0, 5) ?? '');
        setTimeTo(data.end_time?.slice(0, 5) ?? '');
      }
      setLoading(false);
    };

    fetchProfile();
  }, []);

  const toggleDay = (day: Day) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    // 郵便番号はジオコ精度向上のための任意入力。保存後は address（display_name）に
    // 畳まれ再表示時に復元できないため、必須にすると既存代理人の再保存を妨げる。住所のみ必須。
    if (!address) {
      Alert.alert('入力エラー', '住所は必須です。');
      return;
    }
    if (address.length > 200) {
      Alert.alert('入力エラー', '住所は200文字以内で入力してください。');
      return;
    }
    if (roomNumber.length > 100) {
      Alert.alert('入力エラー', '部屋番号・号室は100文字以内で入力してください。');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('入力エラー', '受取可能曜日を1日以上選択してください。');
      return;
    }
    if (!timeFrom || !timeTo) {
      Alert.alert('入力エラー', '受取可能時間帯を入力してください。');
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // geocode-agent-address は Nominatim に単一住所文字列 q=address を投げるため、
    // ジオコ可能な「郵便番号＋住所本体」のみを address に渡し、部屋番号等は addressDetail に分離する。
    // '郵便番号|住所|部屋' を連結したまま渡すとジオコに失敗するため（A0 確認事項）。
    const geocodeAddress = [postalCode, address].filter(Boolean).join(' ');

    try {
      await geocodeAgentAddress({
        userId: user.id,
        address: geocodeAddress,
        addressDetail: roomNumber || undefined,
        availableDays: selectedDays,
        startTime: timeFrom,
        endTime: timeTo,
      });
    } catch {
      setSaving(false);
      Alert.alert('エラー', 'プロファイルの保存に失敗しました。');
      return;
    }

    if (emergencyContact) {
      // 緊急連絡先（電話番号）のみの部分更新。upsertProfile は role/fullName が必須で、
      // ここでは未保持のため使うと既存値を上書きしてしまう。RLS は自分の行更新を許可するため
      // phone だけの直 update を意図的に維持する（B6）。
      await supabase.from('profiles').update({ phone: emergencyContact }).eq('id', user.id);
    }

    setSaving(false);

    Alert.alert('保存しました', 'プロファイルを保存しました。', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="代理人プロファイル" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={styles.sectionTitle}>受取場所</Text>

          <View style={styles.field}>
            <Text style={styles.label}>郵便番号（任意）</Text>
            <TextInput
              style={styles.input}
              placeholder="例: 150-0001"
              placeholderTextColor="#9CA3AF"
              value={postalCode}
              onChangeText={setPostalCode}
              keyboardType="numeric"
              maxLength={8}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>
              住所 <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="例: 東京都渋谷区代々木1-2-3"
              placeholderTextColor="#9CA3AF"
              value={address}
              onChangeText={setAddress}
              maxLength={200}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>部屋番号・号室</Text>
            <TextInput
              style={styles.input}
              placeholder="例: 203号室"
              placeholderTextColor="#9CA3AF"
              value={roomNumber}
              onChangeText={setRoomNumber}
              maxLength={100}
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>
            受取可能日時 <Text style={styles.required}>*</Text>
          </Text>

          <Text style={styles.label}>受取可能曜日</Text>
          <View style={styles.daysRow}>
            {DAYS.map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.dayChip, selectedDays.includes(day) && styles.dayChipActive]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayChipText, selectedDays.includes(day) && styles.dayChipTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>受取可能時間帯</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="09:00"
              placeholderTextColor="#9CA3AF"
              value={timeFrom}
              onChangeText={setTimeFrom}
              keyboardType="numeric"
              maxLength={5}
            />
            <Text style={styles.timeSeparator}>〜</Text>
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="18:00"
              placeholderTextColor="#9CA3AF"
              value={timeTo}
              onChangeText={setTimeTo}
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>緊急連絡先（任意）</Text>
          <View style={styles.field}>
            <Text style={styles.label}>電話番号</Text>
            <TextInput
              style={styles.input}
              placeholder="例: 090-1234-5678"
              placeholderTextColor="#9CA3AF"
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              keyboardType="phone-pad"
            />
          </View>
        </Card>

        <PrimaryButton
          label="保存する"
          icon="checkmark-circle-outline"
          loading={saving}
          onPress={handleSave}
          style={styles.saveButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  required: { color: '#EF4444' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  daysRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dayChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  dayChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  dayChipText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  dayChipTextActive: { color: '#FFFFFF' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeInput: { flex: 1, textAlign: 'center' },
  timeSeparator: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  saveButton: { marginTop: 8 },
});
