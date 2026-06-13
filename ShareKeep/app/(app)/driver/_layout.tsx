import { Stack } from 'expo-router';

// 配達員（delivery_company）画面の Stack。受取人/代理人と同じく headerShown:false で
// 各画面が ScreenHeader を自前で描く方針に合わせる。
export default function DriverLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
