import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { cardShadow, radius } from '../lib/theme';

export type DriverAgentMapItem = {
  user_id: string;
  full_name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type DriverAgentMapProps = {
  region: Region;
  agents: DriverAgentMapItem[];
  selectedId: string | null;
  onSelect: (agent: DriverAgentMapItem) => void;
  onError: () => void;
};

export function DriverAgentMap({
  region,
  agents,
  selectedId,
  onSelect,
  onError,
}: DriverAgentMapProps) {
  return (
    <MapErrorBoundary onError={onError}>
      <View style={styles.mapWrap}>
        <MapView style={styles.map} initialRegion={region}>
          {agents.map((agent) => (
            <Marker
              key={agent.user_id}
              coordinate={{ latitude: agent.latitude, longitude: agent.longitude }}
              title={agent.full_name}
              description={agent.address ?? undefined}
              pinColor={agent.user_id === selectedId ? '#1A7A4C' : undefined}
              onPress={() => onSelect(agent)}
            />
          ))}
        </MapView>
      </View>
    </MapErrorBoundary>
  );
}

class MapErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  mapWrap: {
    height: 240,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...cardShadow,
  },
  map: { flex: 1 },
});
