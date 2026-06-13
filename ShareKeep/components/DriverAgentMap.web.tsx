import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import type { DriverAgentMapItem } from './DriverAgentMap.native';

type DriverAgentMapProps = {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  agents: DriverAgentMapItem[];
  selectedId: string | null;
  onSelect: (agent: DriverAgentMapItem) => void;
  onError: () => void;
};

export function DriverAgentMap(_props: DriverAgentMapProps) {
  return (
    <View style={styles.mapFallback}>
      <Ionicons name="map-outline" size={28} color={colors.grayLight} />
      <Text style={styles.mapFallbackText}>
        地図を表示できません。下のリストから選択してください。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    height: 120,
    borderRadius: radius.card,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  mapFallbackText: { fontSize: 13, color: colors.gray, textAlign: 'center' },
});
