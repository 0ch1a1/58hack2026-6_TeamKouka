import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const GREEN = '#1A7A4C';
const BG = '#F0FAF4';

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

  const toggleDay = (day: Day) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = () => {
    if (!postalCode || !address) {
      Alert.alert('入力エラー', '郵便番号と住所は必須です。');
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

    // TODO: Supabase の pickup_spots テーブルへ保存
    Alert.alert('保存しました', 'プロファイルを保存しました。', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>代理人プロファイル</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 住所 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>受取場所</Text>

          <View style={styles.field}>
            <Text style={styles.label}>
              郵便番号 <Text style={styles.required}>*</Text>
            </Text>
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
            />
          </View>
        </View>

        {/* 受取可能日時 */}
        <View style={styles.section}>
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
        </View>

        {/* 緊急連絡先 */}
        <View style={styles.section}>
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
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>保存する</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    width: 36,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  dayChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  dayChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  dayChipTextActive: {
    color: '#FFFFFF',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeInput: {
    flex: 1,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
