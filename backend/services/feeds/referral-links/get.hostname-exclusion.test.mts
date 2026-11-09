import { describe, expect, it } from 'vitest'
import {
  createHostnameExclusionFixture,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import { getReferralLinksFeed } from './get.mts'

describe('getReferralLinksFeed hostname exclusion', () => {
  it('excludes one child-hostname link for overlapping block and mute relations', async () => {
    const { viewer, publisher, blockedUrlId, visibleUrlId } = await createHostnameExclusionFixture()
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
  })
})
