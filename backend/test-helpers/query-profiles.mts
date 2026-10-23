import { createQueryProfiles } from '@vouchington/postgres/query-telemetry'

/** The single test-side profiles instance; production code never profiles requests or workers. */
export const {
  observe: observeQueryProfile,
  createRequestQueryProfile,
  runIndependentWorker,
} = createQueryProfiles({ registryKey: Symbol.for('voucha.test.queryProfiles') })

export type {
  RequestQueryProfile,
  RequestQuerySummary,
  RepeatedAnnotation,
  WorkerQueryProfile,
} from '@vouchington/postgres/query-telemetry'
