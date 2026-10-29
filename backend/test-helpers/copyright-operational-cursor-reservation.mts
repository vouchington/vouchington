import { afterEach, beforeEach } from 'vitest'
import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from './postgres-advisory-lock.mts'

/** Serialize tests that write the seven singleton operational-retention cursors. */
export function useCopyrightOperationalCursorReservation(): void {
  let reservation: TestPostgresAdvisoryLock | undefined
  beforeEach(async () => {
    reservation = await acquireTestPostgresAdvisoryLock({
      namespace: 0x434f5059,
      key: 3628,
      timeout: '5s',
    })
  })
  afterEach(async () => reservation?.release())
}
