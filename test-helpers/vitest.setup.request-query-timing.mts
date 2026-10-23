import { vi } from 'vitest'

vi.mock<typeof import('@vouchington/postgres/query-telemetry')>(
  import('@vouchington/postgres/query-telemetry'),
  async importOriginal => {
    const actual = await importOriginal()
    const { observeQueryProfile } = await import('../backend/test-helpers/query-profiles.mts')

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
