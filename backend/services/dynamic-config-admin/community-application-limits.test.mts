import { describe, expect, it } from 'vitest'
import { DynamicConfigValidationError } from 'valkyries/dynamic-config'
import { createTestUser } from '@voucha/test-helpers'
import { getCommunityApplicationLimits } from '@services/communities/applications/question-limits'
import { updateDynamicConfigNamespace } from './service.mts'

describe('community application limit administration', () => {
  it.each(['questions_per_community', 'options_per_question'])(
    'rejects %s above its maximum of 1000 without writing configuration',
    async field => {
      const developer = await createTestUser({ extraRoles: ['developer'] })
      const before = getCommunityApplicationLimits()

      await expect(
        updateDynamicConfigNamespace(developer, 'community-application-limits-config', {
          [field]: 1001,
        }),
      ).rejects.toBeInstanceOf(DynamicConfigValidationError)

      expect(getCommunityApplicationLimits()).toEqual(before)
    },
  )
})
