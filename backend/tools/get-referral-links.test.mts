import { describe, expect, it } from 'vitest'
import getReferralLinksTool from './get-referral-links.mts'
import {
  createRandomString,
  createReferralProgramFixture,
  createTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { insertTestCard, assignReferralProgramToCard } from '@voucha/test-helpers/entities/cards'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { createUserReferralLink } from '@services/user-referral-program-links'
import type { PrivateUser } from '@services/users/types'

describe('get-referral-links', () => {
  async function createCardWithReferralProgram(user: PrivateUser) {
    const suffix = createRandomString(8)
    const cardTopicId = await insertTestCard({ createdById: user.id })
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: suffix,
      hostname: `tool-referral-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const referralProgramId = fixture.referralProgramId
    await assignReferralProgramToCard(cardTopicId, referralProgramId)
    return { cardTopicId, referralProgramId, hostname: fixture.hostname }
  }

  async function createLinkForProgram(input: {
    referralProgramId: string
    hostname: string
    label?: string | null
  }) {
    const linkUser = await createTestUser()
    const suffix = createRandomString(8)
    const url = `https://${input.hostname}/ref/${suffix}`
    const link = await createUserReferralLink(WEB_PROVENANCE, linkUser, {
      user_id: linkUser.id,
      referral_program_id: input.referralProgramId,
      url,
      label: input.label,
    })
    return { link, linkUser, url }
  }

  describe('get_referral_links tool', () => {
    it('returns error when topic does not exist', async () => {
      const user = await createTestUser()
      const execute = getReferralLinksTool.function(user)

      const result = await execute({ topic_id: '00000000-0000-7000-8000-000000000001' })

      expect(result.success).toBe(false)
      expect((result as Extract<typeof result, { success: false }>).error).toBe('Topic not found')
    })

    it('returns error for a topic that is not a card (no topics__cards entry)', async () => {
      const user = await createTestUser()
      const suffix = crypto.randomUUID().slice(0, 8)
      const nonCardTopicId = await insertTestTopic({
        name: `Not A Card ${suffix}`,
        slug: `not-a-card-${suffix}`,
        createdById: user.id,
        topicType: 'topic',
      })

      const execute = getReferralLinksTool.function(user)
      const result = await execute({ topic_id: nonCardTopicId })

      expect(result.success).toBe(false)
    })

    it('calls getPrioritizedReferralLinks with correct user and program ID', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId } = await createCardWithReferralProgram(user)

      const execute = getReferralLinksTool.function(user)
      const result = await execute({ topic_id: cardTopicId })

      expect(result.success).toBe(true)
      expect((result as Extract<typeof result, { success: true }>).referral_program_id).toBe(
        referralProgramId,
      )
    })

    it('returns success with empty links when groups are all empty', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId } = await createCardWithReferralProgram(user)

      const execute = getReferralLinksTool.function(user)
      const result = await execute({ topic_id: cardTopicId })

      expect(result.success).toBe(true)
      const successResult = result as Extract<typeof result, { success: true }>
      expect(successResult.links).toEqual([])
      expect(successResult.referral_program_id).toBe(referralProgramId)
    })

    it('returns formatted links flattened from all priority groups', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId, hostname } = await createCardWithReferralProgram(user)
      const { link, linkUser, url } = await createLinkForProgram({
        referralProgramId,
        hostname,
        label: 'My referral link',
      })

      const execute = getReferralLinksTool.function(user)
      const result = await execute({ topic_id: cardTopicId })

      expect(result.success).toBe(true)
      const successResult = result as Extract<typeof result, { success: true }>
      expect(successResult.links).toHaveLength(1)
      expect(successResult.links[0].id).toBe(link.id)
      expect(successResult.links[0].url).toBe(url)
      expect(successResult.links[0].username).toBe(linkUser.username)
      expect(successResult.links[0].display_name).toBeNull()
      expect(successResult.links[0].priority_group).toBe(5)
    })

    it('preserves null labels', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId, hostname } = await createCardWithReferralProgram(user)
      const { link } = await createLinkForProgram({
        referralProgramId,
        hostname,
        label: null,
      })

      const execute = getReferralLinksTool.function(user)
      const result = await execute({ topic_id: cardTopicId })

      expect(result.success).toBe(true)
      const successResult = result as Extract<typeof result, { success: true }>
      expect(successResult.links[0]).toMatchObject({ id: link.id, label: null })
    })
  })
})
