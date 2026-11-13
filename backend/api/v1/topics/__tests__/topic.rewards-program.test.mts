import { describe } from 'vitest'

import { registerTopicProgramAttributeRouteTests } from '../../../../test-helpers/topic-program-attribute-route-tests.mts'

describe('topic.rewards-program', () => {
  describe('Topic Rewards Program Routes', () => {
    registerTopicProgramAttributeRouteTests('rewards', ['get', 'patch'], 'public')
  })
})
