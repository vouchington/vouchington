import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
  softDeleteReferralLink,
} from '@voucha/test-helpers'
import { getUserReferralLink } from './get.mts'
import {
  markReferralLinkUnfurlRequested,
  markReferralLinkUnfurlCompleted,
  markReferralLinkUnfurlFailed,
} from './unfurl-state.mts'

const NONEXISTENT_LINK_ID = '00000000-0000-0000-0000-000000000000'

describe('unfurl-state', () => {
  let userId: string
  let referralProgramId: string

  beforeAll(async () => {
    const user = await createTestUserDirect()
    userId = user!.id
    referralProgramId = await insertTestReferralProgram({ createdById: userId })
  })

  async function createLink(): Promise<string> {
    const urlId = await createTestUrlWithHostname()
    return insertTestUserReferralProgramLink({ userId, referralProgramId, urlId })
  }

  describe('markReferralLinkUnfurlRequested', () => {
    it('sets unfurl_requested_at and returns the updated row', async () => {
      const linkId = await createLink()

      const updated = await markReferralLinkUnfurlRequested(linkId)

      expect(updated?.id).toBe(linkId)
      expect(updated?.unfurl_requested_at).toBeTruthy()

      const stored = await getUserReferralLink(linkId)
      expect(stored?.unfurl_requested_at).toBeTruthy()
    })

    it('clears a prior failed state', async () => {
      const linkId = await createLink()
      await markReferralLinkUnfurlRequested(linkId)
      await markReferralLinkUnfurlFailed(linkId, 'boom')

      const failed = await getUserReferralLink(linkId)
      expect(failed?.unfurl_failed_at).toBeTruthy()
      expect(failed?.unfurl_last_error).toBe('boom')

      const retried = await markReferralLinkUnfurlRequested(linkId)

      expect(retried?.unfurl_failed_at).toBeNull()
      expect(retried?.unfurl_last_error).toBeNull()
      expect(retried?.unfurl_requested_at).toBeTruthy()
    })

    it('returns null for a nonexistent link id', async () => {
      const result = await markReferralLinkUnfurlRequested(NONEXISTENT_LINK_ID)
      expect(result).toBeNull()
    })

    it('returns null for a soft-deleted link id', async () => {
      const linkId = await createLink()
      await softDeleteReferralLink(linkId)

      const result = await markReferralLinkUnfurlRequested(linkId)
      expect(result).toBeNull()
    })
  })

  describe('markReferralLinkUnfurlCompleted', () => {
    it('sets unfurl_completed_at and clears any failed state', async () => {
      const linkId = await createLink()
      await markReferralLinkUnfurlRequested(linkId)
      await markReferralLinkUnfurlFailed(linkId, 'boom')

      await markReferralLinkUnfurlCompleted(linkId)

      const stored = await getUserReferralLink(linkId)
      expect(stored?.unfurl_completed_at).toBeTruthy()
      expect(stored?.unfurl_failed_at).toBeNull()
      expect(stored?.unfurl_last_error).toBeNull()
    })

    it('resolves without throwing for a nonexistent link id', async () => {
      await expect(markReferralLinkUnfurlCompleted(NONEXISTENT_LINK_ID)).resolves.toBeUndefined()
    })

    it('resolves without throwing for a soft-deleted link id', async () => {
      const linkId = await createLink()
      await softDeleteReferralLink(linkId)

      await expect(markReferralLinkUnfurlCompleted(linkId)).resolves.toBeUndefined()
      expect(await getUserReferralLink(linkId)).toBeNull()
    })
  })

  describe('markReferralLinkUnfurlFailed', () => {
    it('sets unfurl_failed_at and stores the error message', async () => {
      const linkId = await createLink()

      await markReferralLinkUnfurlFailed(linkId, 'network timeout')

      const stored = await getUserReferralLink(linkId)
      expect(stored?.unfurl_failed_at).toBeTruthy()
      expect(stored?.unfurl_last_error).toBe('network timeout')
    })

    it('truncates an error message over 1000 characters', async () => {
      const linkId = await createLink()
      const longMessage = 'x'.repeat(1500)

      await markReferralLinkUnfurlFailed(linkId, longMessage)

      const stored = await getUserReferralLink(linkId)
      expect(stored?.unfurl_last_error).toBe('x'.repeat(1000))
    })

    it('resolves without throwing for a nonexistent link id', async () => {
      await expect(
        markReferralLinkUnfurlFailed(NONEXISTENT_LINK_ID, 'boom'),
      ).resolves.toBeUndefined()
    })

    it('resolves without throwing for a soft-deleted link id', async () => {
      const linkId = await createLink()
      await softDeleteReferralLink(linkId)

      await expect(markReferralLinkUnfurlFailed(linkId, 'boom')).resolves.toBeUndefined()
      expect(await getUserReferralLink(linkId)).toBeNull()
    })
  })
})
