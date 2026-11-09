import { describe, expect, it } from 'vitest'
import {
  createHostnameExclusionFixture,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import { getReferralLinksFeed } from './get.mts'

describe('getReferralLinksFeed hostname exclusion', () => {
  it.each(['_', '%'] as const)(
    'preserves SQL LIKE wildcard semantics for %s with overlapping block and mute relations',
    async patternWildcard => {
      const { viewer, publisher, blockedUrlId, visibleUrlId } =
        await createHostnameExclusionFixture({ patternWildcard })
      const blockedProgramId = await insertTestReferralProgram({ createdById: publisher.id })
      const visibleProgramId = await insertTestReferralProgram({ createdById: publisher.id })
      await insertTestUserReferralProgramLink({
        userId: publisher.id,
        referralProgramId: blockedProgramId,
        urlId: blockedUrlId,
      })
      const visibleLinkId = await insertTestUserReferralProgramLink({
        userId: publisher.id,
        referralProgramId: visibleProgramId,
        urlId: visibleUrlId,
      })

      const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })
      const resultIds = result.results.map(row => row.id)

      expect(resultIds).toEqual([visibleLinkId])
    },
  )
})
