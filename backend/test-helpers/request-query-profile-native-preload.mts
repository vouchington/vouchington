/* oxlint-disable vitest/no-import-node-test -- The native MV preflight uses Node's public module mock API, outside Vitest. */
import { mock } from 'node:test'
import * as actual from '@vouchington/postgres/query-telemetry'
import { observeQueryProfile } from './query-profiles.mts'

if (typeof mock.module !== 'function') {
  throw new Error(
    'Native query profiling requires Node.js --experimental-test-module-mocks before app imports',
  )
}

const createQueryTimingRecorder: typeof actual.createQueryTimingRecorder = options =>
  actual.createQueryTimingRecorder({
    ...options,
    observe: input => {
      options.observe?.(input)
      observeQueryProfile(input)
    },
  })

mock.module('@vouchington/postgres/query-telemetry', {
  exports: { ...actual, createQueryTimingRecorder },
})
