/** Jest config for ShareKeep UI unit tests (jest-expo preset). */
module.exports = {
  preset: 'jest-expo',
  // @testing-library/react-native v14 auto-extends Jest matchers, no setup file needed.
  // Expo / React Native ships untranspiled ESM; let babel transform these.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(test).[jt]s?(x)'],
};
