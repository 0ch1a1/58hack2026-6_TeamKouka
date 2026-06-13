// Lightweight mock for @expo/vector-icons. The real module pulls in expo-font /
// expo-asset (native modules) which are unavailable under jest. For unit tests we
// only need an identifiable component, so each icon set renders a plain <Text>.
import { Text } from 'react-native';

function makeIcon(displayName: string) {
  const Icon = (props: { name?: string }) => <Text>{`icon:${props.name ?? ''}`}</Text>;
  Icon.displayName = displayName;
  return Icon;
}

export const Ionicons = makeIcon('Ionicons');
export const MaterialIcons = makeIcon('MaterialIcons');
export const MaterialCommunityIcons = makeIcon('MaterialCommunityIcons');
export const FontAwesome = makeIcon('FontAwesome');
export const FontAwesome5 = makeIcon('FontAwesome5');
export const Feather = makeIcon('Feather');
export const AntDesign = makeIcon('AntDesign');
export const Entypo = makeIcon('Entypo');
