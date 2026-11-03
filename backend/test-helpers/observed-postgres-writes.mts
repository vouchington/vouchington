import { vi } from 'vitest'
import * as psql from '@data-stores/psql'

/**
 * Record each default-pool `write()` whose statement text contains `marker` (the leading SQL comment
 * label) while still running it. `writes` holds one promise per call so a test can wait for exactly
 * the writes it triggered; restore the spy with `vi.restoreAllMocks()`.
 */
export function observePostgresWritesForTest(marker: string): { writes: Promise<unknown>[] } {
  const writes: Promise<unknown>[] = []
  const realWrite = psql.write
  vi.spyOn(psql, 'write').mockImplementation((query, ...rest) => {
    const result = realWrite(query, ...rest)
    const text = typeof query === 'string' ? query : query.text
    if (text.includes(marker)) writes.push(result)
    return result
  })
  return { writes }
}
