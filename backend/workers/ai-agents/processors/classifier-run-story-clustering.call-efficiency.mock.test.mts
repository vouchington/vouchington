import { vi } from 'vitest'
import { describeClassifierCallEfficiency } from '@voucha/test-helpers/classifier-call-efficiency-tests'
import { storyClusteringEfficiencyDriver } from '@voucha/test-helpers/classifier-call-efficiency-driver-story-clustering'
import type { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

describeClassifierCallEfficiency(storyClusteringEfficiencyDriver)
