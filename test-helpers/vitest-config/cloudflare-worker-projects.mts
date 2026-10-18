import type { TestProjectConfiguration } from 'vitest/config'

export const cloudflareWorkerProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      isolate: false,
      name: 'cloudflare-worker',
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: ['cloudflare-worker/**/*.test.mts'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        'cloudflare-worker/**/*.mock.test.mts',
        'cloudflare-worker/scripts/wrangler/runtime.test.mts',
      ],
    },
  },
  {
    extends: true,
    test: {
      isolate: false,
      name: 'cloudflare-worker-portability',
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: ['cloudflare-worker/scripts/wrangler/runtime.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  },
  {
    extends: true,
    test: {
      isolate: true,
      name: 'cloudflare-worker-mocks',
      testTimeout: 5_000,
      hookTimeout: 5_000,
      include: ['cloudflare-worker/**/*.mock.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  },
]
