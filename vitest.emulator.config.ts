import { defineConfig } from 'vitest/config';

// Separate config for Firestore rules emulator tests.
// Used by: npm run test:rules:vitest (via npm run test:rules)
// Requires: Firebase emulator running with Java 21+
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/firestore-rules.emulator.test.ts'],
  },
});
