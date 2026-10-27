import 'dotenv/config'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    fileParallelism: false,
    restoreMocks: true,
  },
})
