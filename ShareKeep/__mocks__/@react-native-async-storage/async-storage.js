// Manual mock for @react-native-async-storage/async-storage.
// The real module is a native module (NativeModule: AsyncStorage is null under jest),
// so any test that transitively imports lib/supabase.ts (which imports AsyncStorage)
// fails to load. Jest auto-applies this root __mocks__ entry for the node_modules
// package — same convention as __mocks__/@expo/vector-icons.tsx.
//
// Re-export the official in-memory jest mock shipped with the package.
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
