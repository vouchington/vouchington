import * as psql from '@data-stores/psql'
import {
  observePostgresWritesForTest as observeTargetPostgresWrites,
  type WriteQueryTarget,
} from 'vouchington-tooling/postgres-test-faults'

/**
 * Record each default-pool `write()` whose statement text contains `marker` (the leading SQL comment
 * label) while still running it. `writes` holds one promise per call so a test can wait for exactly
 * the writes it triggered; call `restore()` or `vi.restoreAllMocks()` to clean up.
 */
export function observePostgresWritesForTest(marker: string) {
  return observeTargetPostgresWrites(psql as unknown as WriteQueryTarget, marker)
}
