import { join } from 'node:path'

import {
  VITEST_REPORT_ATTEMPT_PREFIX,
  writeVitestReportAttempt,
} from 'vouchington-tooling/vitest-blob-manifest'

export interface ExpectationOptions {
  readonly attempts?: Readonly<Record<string, number>>
  readonly shardTotals?: Partial<Record<string, string>>
  readonly runnable?: Partial<Record<string, boolean>>
  readonly storybookBrowserMode?: string
  readonly portabilityMacosEnabled?: boolean
}

export type ProducerResults = Record<string, { result: string; attempt?: string }>
export type SuiteExpectation = { readonly suite: string; readonly minimumAttempt: number }

const suitesByJob: Readonly<Record<string, readonly string[]>> = {
  'test-ts-shared': ['ts-shared'],
  'test-tooling': ['tooling'],
  'test-backend-modules': ['backend-modules'],
  'test-backend-unit': [
    'backend-shard-1',
    'backend-shard-2',
    'backend-shard-3',
    'backend-shard-4',
    'backend-shard-5',
    'backend-shard-6',
    'backend-shard-7',
    'backend-shard-8',
  ],
  'test-backend-credentialed': ['backend-credentialed'],
  'test-web': ['web-shard-1', 'web-shard-2', 'web-shard-3'],
  'test-web-api': ['web-api-shard-1', 'web-api-shard-2'],
  storybook: ['web-storybook', 'web-storybook-browser'],
  'test-web-integration': ['web-integration-shard-1'],
  'test-cloudflare-worker': ['cloudflare-worker'],
  'test-lambdas': ['lambdas'],
  'test-portability': ['portability-linux', 'portability-macos'],
}

export function writeAttemptFixtures(
  directory: string,
  results: Readonly<Record<string, { readonly result: string; readonly attempt?: string }>>,
): void {
  for (const [job, result] of Object.entries(results)) {
    if (result.result !== 'success') continue
    for (const suite of suitesByJob[job] ?? []) {
      writeVitestReportAttempt(join(directory, `${VITEST_REPORT_ATTEMPT_PREFIX}${suite}`), suite, {
        repository: 'jonathanong/filaments',
        revision: 'a'.repeat(40),
        runId: '9131',
        attempt: Number(result.attempt ?? 2),
      })
    }
  }
}

export function writeExplicitAttemptFixtures(
  directory: string,
  attempts: Readonly<Record<string, number>>,
): void {
  for (const [suite, attempt] of Object.entries(attempts)) {
    writeVitestReportAttempt(join(directory, `${VITEST_REPORT_ATTEMPT_PREFIX}${suite}`), suite, {
      repository: 'jonathanong/filaments',
      revision: 'a'.repeat(40),
      runId: '9131',
      attempt,
    })
  }
}
