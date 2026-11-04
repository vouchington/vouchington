import { describe, expect, it, onTestFinished } from 'vitest'
import getReferralLinksTool from './get-referral-links.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { prioritizedReferralLinksWorkConfig } from '@services/prioritized-referral-links/work-limits'
import {
  createRandomString,
  createReferralProgramFixture,
  createTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { insertTestCard, assignReferralProgramToCard } from '@voucha/test-helpers/entities/cards'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { createOfficialReferralLink } from '@services/official-referral-program-links'
import { upsertSystemUser } from '@services/users/system-users'
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
    const link = await createUserReferralLink(linkUser, WEB_PROVENANCE, {
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

    it('returns error for a topic that is not a card (no card_topics entry)', async () => {
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
      expect(successResult.links[0].priority_group).toBe(6)
    })

    it('ranks official links before everyone else and flags them, in default and all modes', async () => {
      await upsertSystemUser('voucha', 'official')
      const admin = await createTestUser({ administrator: true })
      const { cardTopicId, referralProgramId, hostname } =
        await createCardWithReferralProgram(admin)
      const official = await createOfficialReferralLink(admin, WEB_PROVENANCE, {
        referral_program_id: referralProgramId,
        url: `https://${hostname}/ref/official-${createRandomString(8)}`,
        label: 'Official',
      })
      const { link } = await createLinkForProgram({ referralProgramId, hostname })
      const execute = getReferralLinksTool.function(admin)

      for (const args of [{ topic_id: cardTopicId }, { topic_id: cardTopicId, all: true }]) {
        const result = await execute(args)
        const links = (result as Extract<typeof result, { success: true }>).links
        expect(links.map(l => [l.id, l.priority_group, l.is_official]).toSorted()).toEqual(
          [
            [official.id, 5, true],
            [link.id, 6, false],
          ].toSorted(),
        )
      }
      const result = await execute({ topic_id: cardTopicId })
      expect((result as Extract<typeof result, { success: true }>).links.map(l => l.id)).toEqual([
        official.id,
        link.id,
      ])
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

    it('pages every visible link newest first with all, limit and after', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId, hostname } = await createCardWithReferralProgram(user)
      const first = await createLinkForProgram({ referralProgramId, hostname })
      const second = await createLinkForProgram({ referralProgramId, hostname })
      const execute = getReferralLinksTool.function(user)

      const page1 = (await execute({ topic_id: cardTopicId, all: true, limit: 1 })) as Extract<
        Awaited<ReturnType<typeof execute>>,
        { success: true }
      >
      expect(page1.links.map(l => l.id)).toEqual([second.link.id])
      expect(page1.page_info.has_next_page).toBe(true)

      const page2 = (await execute({
        topic_id: cardTopicId,
        all: true,
        limit: 1,
        after: page1.page_info!.end_cursor!,
      })) as Extract<Awaited<ReturnType<typeof execute>>, { success: true }>
      expect(page2.links.map(l => l.id)).toEqual([first.link.id])
      expect(page2.page_info.has_next_page).toBe(false)
    })

    it('pages the shared ranked list with limit and after, clamping an oversized limit', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId, hostname } = await createCardWithReferralProgram(user)
      const created = []
      for (let i = 0; i < 3; i++)
        created.push(await createLinkForProgram({ referralProgramId, hostname }))
      const execute = getReferralLinksTool.function(user)
      type Success = Extract<Awaited<ReturnType<typeof execute>>, { success: true }>

      const page1 = (await execute({ topic_id: cardTopicId, limit: 2 })) as Success
      expect(page1.links).toHaveLength(2)
      expect(page1.page_info.has_next_page).toBe(true)
      const page2 = (await execute({
        topic_id: cardTopicId,
        limit: 2,
        after: page1.page_info.end_cursor!,
      })) as Success
      expect(page2.links).toHaveLength(1)
      expect(page2.page_info.has_next_page).toBe(false)
      expect(new Set([...page1.links, ...page2.links].map(l => l.id))).toEqual(
        new Set(created.map(c => c.link.id)),
      )

      const oversized = (await execute({ topic_id: cardTopicId, limit: 1000 })) as Success
      expect(oversized.links).toHaveLength(3)
    })

    it('uses the configured default page size when limit is omitted', async () => {
      const user = await createTestUser()
      const { cardTopicId, referralProgramId, hostname } = await createCardWithReferralProgram(user)
      for (let i = 0; i < 5; i++) await createLinkForProgram({ referralProgramId, hostname })
      onTestFinished(
        overrideDynamicConfigFieldsForTest(prioritizedReferralLinksWorkConfig, {
          personalized_link_limit: 3,
        }),
      )

      const result = await getReferralLinksTool.function(user)({ topic_id: cardTopicId })

      expect(result.success && result.links).toHaveLength(3)
    })

    it('rejects a limit below 1 or not an integer, with and without all', async () => {
      const user = await createTestUser()
      const { cardTopicId } = await createCardWithReferralProgram(user)
      const execute = getReferralLinksTool.function(user)

      for (const limit of [0, -3, 1.5]) {
        expect(await execute({ topic_id: cardTopicId, limit })).toEqual({
          success: false,
          error: 'Invalid limit',
        })
        expect(await execute({ topic_id: cardTopicId, limit, all: true })).toEqual({
          success: false,
          error: 'Invalid limit',
        })
      }
    })

    it('rejects a malformed cursor without all', async () => {
      const user = await createTestUser()
      const { cardTopicId } = await createCardWithReferralProgram(user)

      const result = await getReferralLinksTool.function(user)({
        topic_id: cardTopicId,
        after: 'not-a-cursor',
      })

      expect(result).toEqual({ success: false, error: 'Invalid cursor' })
    })

    it('rejects a malformed cursor with all', async () => {
      const user = await createTestUser()
      const { cardTopicId } = await createCardWithReferralProgram(user)

      const result = await getReferralLinksTool.function(user)({
        topic_id: cardTopicId,
        all: true,
        after: 'not-a-cursor',
      })

      expect(result).toEqual({ success: false, error: 'Invalid cursor' })
    })
  })
})
