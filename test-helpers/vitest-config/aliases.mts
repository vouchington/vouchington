import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { TestProjectConfiguration } from 'vitest/config'

type InlineProject = Extract<TestProjectConfiguration, { extends?: unknown }>
type AliasOptions = NonNullable<NonNullable<InlineProject['resolve']>['alias']>
type Alias = Extract<AliasOptions, readonly unknown[]>[number]

const backendApiRequire = createRequire(resolve(process.cwd(), 'backend/api/package.json'))

export function realGlideMqAlias(): Alias {
  return {
    find: /^glide-mq$/,
    replacement: backendApiRequire.resolve('glide-mq'),
  }
}

export function backendAliases({
  useGlideMqShim = true,
}: { useGlideMqShim?: boolean } = {}): Alias[] {
  const aliases: Alias[] = [
    {
      find: /^cloudflare:workers$/,
      replacement: resolve(
        process.cwd(),
        'cloudflare-worker/test-helpers/cloudflare-workers-stub.mts',
      ),
    },
    {
      find: /^undici$/,
      replacement: resolve(process.cwd(), 'backend/modules/utils/node_modules/undici/index.js'),
    },
    {
      find: /^glide-mq\/testing$/,
      replacement: resolve(
        process.cwd(),
        'backend/data-stores/valkey-glide-mq/node_modules/glide-mq/dist/testing.js',
      ),
    },
    {
      find: /^@ts-shared\/(.*)$/,
      replacement: resolve(process.cwd(), 'ts-shared/$1'),
    },
    {
      find: /^@modules\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/modules/$1'),
    },
    {
      find: /^@services\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/services/$1'),
    },
    {
      find: /^@agents\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/agents/$1'),
    },
    {
      find: /^@queues\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/queues/$1'),
    },
    {
      find: /^@workers\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/workers/$1'),
    },
    {
      find: /^@flows\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/flows/$1'),
    },
    {
      find: /^@data-stores\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/data-stores/$1'),
    },
    {
      find: /^@vouchington\/csv$/,
      replacement: resolve(process.cwd(), 'backend/modules/csv/node_modules/@vouchington/csv'),
    },
    {
      find: /^@voucha\/api$/,
      replacement: resolve(process.cwd(), 'backend/api'),
    },
    {
      find: /^@voucha\/api\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/api/$1'),
    },
    {
      find: /^@voucha\/scripts$/,
      replacement: resolve(process.cwd(), 'backend/scripts'),
    },
    {
      find: /^@voucha\/scripts\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/scripts/$1'),
    },
    {
      find: /^@voucha\/server$/,
      replacement: resolve(process.cwd(), 'backend/entrypoints/api'),
    },
    {
      find: /^@voucha\/server\/(.*)$/,
      replacement: resolve(process.cwd(), 'backend/entrypoints/api/$1'),
    },
  ]

  if (useGlideMqShim) {
    aliases.push({
      find: /^glide-mq$/,
      replacement: resolve(process.cwd(), 'test-helpers/glide-mq-vitest-shim.mts'),
    })
  }

  return aliases
}
