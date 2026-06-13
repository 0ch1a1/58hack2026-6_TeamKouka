import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { cardShadow, radius } from '../lib/theme';
import type { DriverAgentMapItem, DriverAgentMapProps } from './DriverAgentMap.types';

export function DriverAgentMap<TAgent extends DriverAgentMapItem>({
  region,
  agents,
  selectedId,
  onSelect,
  onError,
}: DriverAgentMapProps<TAgent>) {
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
