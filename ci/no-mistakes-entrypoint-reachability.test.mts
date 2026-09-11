import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type ReachabilityRule = {
  name?: string
  rule?: string
  scope?: string
  exclude?: string[]
  options?: {
    sourceGlobs?: string[]
    entrypoints?: string[]
    maxDepth?: number
  }
}

function configuredReachabilityRules(): ReachabilityRule[] {
  const config = parseYaml(readFileSync(join(repoRoot, '.no-mistakes.yml'), 'utf8')) as {
    rules?: ReachabilityRule[]
  }
  return (config.rules ?? []).filter(rule => rule.rule === 'required-entrypoint-reachability')
}

describe('required entrypoint reachability configuration', () => {
  it('covers scheduled-job manifests, worker modules, and service registrations from their runtime roots', () => {
    expect(configuredReachabilityRules()).toEqual([
      {
        name: 'scheduled job manifests are registered in the API catalog',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        options: {
          sourceGlobs: ['backend/queues/*/enqueues/schedules.mts'],
          entrypoints: ['backend/api/v1/mq/scheduled-job-manifests.mts'],
          maxDepth: 1,
        },
      },
      {
        name: 'scheduled job manifests are registered in a worker runtime',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        options: {
          sourceGlobs: ['backend/queues/*/enqueues/schedules.mts'],
          entrypoints: [
            'backend/entrypoints/worker-cpu/schedule-definitions.mts',
            'backend/entrypoints/worker-io/definitions.mts',
          ],
          maxDepth: 1,
        },
      },
      {
        name: 'worker modules are registered in a runtime definition root',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        exclude: ['backend/workers/**/*.test.mts', 'backend/workers/**/__tests__/**'],
        options: {
          sourceGlobs: ['backend/workers/*/workers.mts', 'backend/workers/*/workers/*.mts'],
          entrypoints: [
            'backend/entrypoints/worker-cpu/worker-definitions.mts',
            'backend/entrypoints/worker-io/worker-definitions.mts',
            'backend/entrypoints/worker-io/sqs-consumer-definitions.mts',
            'backend/worker-runtime/universal-workers.mts',
          ],
          maxDepth: 2,
        },
      },
      {
        name: 'service registrars are wired into the registration root',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        exclude: ['**/*.test.mts', '**/__tests__/**'],
        options: {
          sourceGlobs: ['backend/services/*/register-*.mts', 'backend/services/*/*/register-*.mts'],
          entrypoints: ['backend/service-registrations/index.mts'],
          maxDepth: 1,
        },
      },
      {
        name: 'api entrypoint loads service registrations',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        options: {
          sourceGlobs: ['backend/service-registrations/index.mts'],
          entrypoints: ['backend/entrypoints/api/index.mts'],
          maxDepth: 1,
        },
      },
      {
        name: 'worker-cpu entrypoint loads service registrations',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        options: {
          sourceGlobs: ['backend/service-registrations/index.mts'],
          entrypoints: ['backend/entrypoints/worker-cpu/index.mts'],
          maxDepth: 1,
        },
      },
      {
        name: 'worker-io entrypoint loads service registrations',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        options: {
          sourceGlobs: ['backend/service-registrations/index.mts'],
          entrypoints: ['backend/entrypoints/worker-io/index.mts'],
          maxDepth: 1,
        },
      },
      {
        name: 'seed entrypoint loads service registrations',
        rule: 'required-entrypoint-reachability',
        scope: 'repository',
        options: {
          sourceGlobs: ['backend/service-registrations/index.mts'],
          entrypoints: ['backend/scripts/seed/index.mts'],
          maxDepth: 1,
        },
      },
    ])
  })
})
