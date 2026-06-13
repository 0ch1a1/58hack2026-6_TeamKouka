export type DriverAgentMapItem = {
  user_id: string;
  full_name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type DriverAgentMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type DriverAgentMapProps<TAgent extends DriverAgentMapItem> = {
  region: DriverAgentMapRegion;
  agents: TAgent[];
  selectedId: string | null;
  onSelect: (agent: TAgent) => void;
  onError: () => void;
};
