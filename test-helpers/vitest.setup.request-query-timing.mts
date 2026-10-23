import { vi } from 'vitest'
import { observeQueryProfile } from '../backend/test-helpers/query-profiles.mts'

// The profiles module imports this package, so the factory must not import it back (deadlock).
vi.mock<typeof import('@vouchington/postgres/query-telemetry')>(
  import('@vouchington/postgres/query-telemetry'),
  async importOriginal => {
    const actual = await importOriginal()

    return {
      ...actual,
      createQueryTimingRecorder: options =>
        actual.createQueryTimingRecorder({
          ...options,
          observe: input => {
            options.observe?.(input)
            observeQueryProfile(input)
          },
        }),
    }
  },
)
