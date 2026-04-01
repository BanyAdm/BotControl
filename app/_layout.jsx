import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#1a1b1e" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
