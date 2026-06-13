import { MapFallback } from './ui';
import type { DriverAgentMapItem, DriverAgentMapProps } from './DriverAgentMap.types';

export function DriverAgentMap<TAgent extends DriverAgentMapItem>(
  _props: DriverAgentMapProps<TAgent>,
) {
  return <MapFallback />;
}
