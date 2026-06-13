import type { DriverAgentMapItem, DriverAgentMapProps } from './DriverAgentMap.types';

export type {
  DriverAgentMapItem,
  DriverAgentMapProps,
  DriverAgentMapRegion,
} from './DriverAgentMap.types';

export declare function DriverAgentMap<TAgent extends DriverAgentMapItem>(
  props: DriverAgentMapProps<TAgent>,
): JSX.Element;
