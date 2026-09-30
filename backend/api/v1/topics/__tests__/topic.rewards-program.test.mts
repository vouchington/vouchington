import { afterAll, describe } from 'vitest'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

import { registerTopicProgramAttributeRouteTests } from '../../../../test-helpers/topic-program-attribute-route-tests.mts'

describe('topic.rewards-program', () => {
  afterAll(async () => {}, 30000) // Increased timeout for cleanup when Playwright test data exists

  describe('Topic Rewards Program Routes', () => {
    registerTopicProgramAttributeRouteTests(
      'rewards',
      ['get', 'patch'],
      `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
    )
  })
})
