import type { QueryTimingInput } from '@vouchington/postgres'
import {
  createQueryTimingRecorder,
  parseQueryTimingSampleRate,
} from '@vouchington/postgres/query-telemetry'
import { emitAnalytics } from './analytics-emit.mts'

export const recordQueryTiming: (input: QueryTimingInput) => void = createQueryTimingRecorder({
  enabled: () => {
    const backend = process.env.ANALYTICS_BACKEND
    return Boolean(backend && backend !== 'disabled')
  },
  sampleRate: () => parseQueryTimingSampleRate(process.env.PG_QUERY_TIMING_SAMPLE),
  random: () => Math.random(),
  emit: record => emitAnalytics('pg_query_timing', record),
})
