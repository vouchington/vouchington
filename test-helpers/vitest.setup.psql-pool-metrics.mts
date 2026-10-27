/* oxlint-disable vitest/require-top-level-describe -- the pool tracker must initialize before
   worker preloads and refresh the current module graph's pools before every test. */
import { beforeEach } from 'vitest'
import {
  installPsqlPoolSocketTracking,
  registerCurrentPsqlPoolMetrics,
} from '../backend/test-helpers/psql-pool-metrics.mts'

installPsqlPoolSocketTracking()
await registerCurrentPsqlPoolMetrics()
beforeEach(registerCurrentPsqlPoolMetrics)
