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

type DriverAgentMapProps<TAgent extends DriverAgentMapItem> = {
  region: Region;
  agents: TAgent[];
  selectedId: string | null;
  onSelect: (agent: TAgent) => void;
  onError: () => void;
};

export declare function DriverAgentMap<TAgent extends DriverAgentMapItem>(
  props: DriverAgentMapProps<TAgent>,
): JSX.Element;
