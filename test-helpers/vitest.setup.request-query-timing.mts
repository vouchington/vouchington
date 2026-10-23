import { vi } from 'vitest'

vi.mock<typeof import('@vouchington/postgres/query-telemetry')>(
  import('@vouchington/postgres/query-telemetry'),
  async importOriginal => {
    const actual = await importOriginal()
    const { recordRequestQueryTiming } =
      await import('../backend/test-helpers/api/request-query-profile-state.mts')

    return {
      ...actual,
      createQueryTimingRecorder: options =>
        actual.createQueryTimingRecorder({
          ...options,
          observe: input => {
            options.observe?.(input)
            recordRequestQueryTiming(input)
          },
        }),
    }
  },
)
