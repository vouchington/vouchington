import { it, expect, describe, beforeAll } from 'vitest'
import {
  beginTransaction,
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  activateTestCommunityAgentPromptHoursAgo,
  deactivateTestCommunityAgentPromptInTransaction,
} from '@voucha/test-helpers/entities/community-automod-effects'
import { setTestCommunityModerationPromptActivatedAt } from '@voucha/test-helpers/community-moderation-prompt-activation'
import { deleteCommunityAgentPrompt } from './delete.mts'
import type { PrivateUser } from '@services/users/types'
import type { QueryExecutor } from '@data-stores/psql'
import type { CommunityAgentPrompt } from './types.mts'
import {
  getActiveCommunityAgentPromptPage,
  type ActiveCommunityAgentPromptCursor,
} from './get-active-prompts.mts'

async function getActiveCommunityAgentPrompts(communityId: string, query?: QueryExecutor) {
  const prompts: CommunityAgentPrompt[] = []
  let after: ActiveCommunityAgentPromptCursor | null = null
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = await getActiveCommunityAgentPromptPage(communityId, after, 30, query)
    prompts.push(...page.items)
    if (!page.next) return prompts
    after = page.next
  }
  throw new Error('test fixture exceeded ten bounded pages')
}

describe('get-active-prompts', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
  })

  describe('getActiveCommunityAgentPrompts', () => {
    it('returns only active (is_slot_allocated=true, activated, not deactivated) prompts', async () => {
      const c = await insertTestCommunity({ createdById: user.id })

      const [active, unallocated] = await Promise.all([
        insertTestCommunityAgentPrompt({
          communityId: c.id,
          createdById: user.id,
          slotAllocated: true,
        }),
        insertTestCommunityAgentPrompt({ communityId: c.id, createdById: user.id }),
      ])

      const results = await getActiveCommunityAgentPrompts(c.id)
      const ids = results.map(r => r.id)
      expect(ids).toContain(active.id)
      expect(ids).not.toContain(unallocated.id)
    })

    it('excludes deleted prompts even if they were active', async () => {
      const c = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({
        communityId: c.id,
        userId: user.id,
        role: 'owner',
      })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: user.id,
        slotAllocated: true,
      })

      await deleteCommunityAgentPrompt(user, p)

      const results = await getActiveCommunityAgentPrompts(c.id)
      expect(results.map(r => r.id)).not.toContain(p.id)
    })

    it('does not return prompts from other communities', async () => {
      const communityA = await insertTestCommunity({ createdById: user.id })
      const communityB = await insertTestCommunity({ createdById: user.id })

      const promptInA = await insertTestCommunityAgentPrompt({
        communityId: communityA.id,
        createdById: user.id,
        slotAllocated: true,
      })

      const resultsB = await getActiveCommunityAgentPrompts(communityB.id)
      expect(resultsB.map(r => r.id)).not.toContain(promptInA.id)
    })

    it('returned prompts include agent_id and prompt text', async () => {
      const c = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: user.id,
        slotAllocated: true,
        prompt: 'Active prompt check',
      })

      const results = await getActiveCommunityAgentPrompts(c.id)
      expect(results.length).toBeGreaterThanOrEqual(1)
      const r = results.find(p => p.prompt === 'Active prompt check')!
      expect(r).toBeDefined()
      expect(r.agent_id).toBeTruthy()
      expect(r.is_slot_allocated).toBe(true)
      expect(r.activated_at).not.toBeNull()
      expect(r.deactivated_at).toBeNull()
    })

    async function activatedPrompts(options: {
      plan: 'plus' | 'pro'
      hoursAgo: readonly number[]
    }) {
      const owner = await createTestUser()
      await createTestMembership({ user_id: owner.id, plan: options.plan })
      const promptCommunity = await insertTestCommunity({ createdById: owner.id })
      const prompts = []
      for (const hoursAgo of options.hoursAgo) {
        const prompt = await insertTestCommunityAgentPrompt({
          communityId: promptCommunity.id,
          createdById: owner.id,
          slotAllocated: true,
        })
        await activateTestCommunityAgentPromptHoursAgo(prompt.id, hoursAgo)
        prompts.push(prompt)
      }
      return { owner, community: promptCommunity, prompts }
    }

    it('returns prompts in activation order, whatever order they were created in', async () => {
      const { community: ordered, prompts } = await activatedPrompts({
        plan: 'pro',
        hoursAgo: [1, 3, 2],
      })

      const results = await getActiveCommunityAgentPrompts(ordered.id)

      expect(results.map(r => r.id)).toEqual([prompts[1]!.id, prompts[2]!.id, prompts[0]!.id])
    })

    it('continues through equal activation timestamps without repeating a prompt', async () => {
      const { community, prompts } = await activatedPrompts({
        plan: 'pro',
        hoursAgo: [1, 1, 1],
      })
      const sameInstant = new Date('2026-01-01T00:00:00.000Z')
      for (const prompt of prompts) {
        await setTestCommunityModerationPromptActivatedAt(prompt.id, sameInstant)
      }
      const first = await getActiveCommunityAgentPromptPage(community.id, null, 2)
      expect(first.items).toHaveLength(2)
      expect(first.next).not.toBeNull()
      const second = await getActiveCommunityAgentPromptPage(community.id, first.next, 2)
      expect(second.items).toHaveLength(1)
      expect(second.next).toBeNull()
      expect([...first.items, ...second.items].map(row => row.id).toSorted()).toEqual(
        prompts.map(row => row.id).toSorted(),
      )
    })

    it('keeps the first three activated prompts of a plus plan and drops the later ones', async () => {
      const { community: capped, prompts } = await activatedPrompts({
        plan: 'plus',
        hoursAgo: [1, 4, 2, 3],
      })

      const results = await getActiveCommunityAgentPrompts(capped.id)

      expect(results.map(r => r.id)).toEqual([prompts[1]!.id, prompts[3]!.id, prompts[2]!.id])
    })

    it('keeps ten prompts for a pro plan', async () => {
      const { community: proCommunity, prompts } = await activatedPrompts({
        plan: 'pro',
        hoursAgo: Array.from({ length: 10 }, (_, index) => 10 - index),
      })

      const results = await getActiveCommunityAgentPrompts(proCommunity.id)

      expect(results.map(r => r.id)).toEqual(prompts.slice(0, 10).map(r => r.id))
    })

    it('resolves on the executor it is given, so a run sees the prompts it locked', async () => {
      const { community: locked, prompts } = await activatedPrompts({
        plan: 'pro',
        hoursAgo: [2, 1],
      })
      await using query = await beginTransaction()
      await deactivateTestCommunityAgentPromptInTransaction(query, prompts[0]!.id)

      const inTransaction = await getActiveCommunityAgentPrompts(locked.id, query)
      const outside = await getActiveCommunityAgentPrompts(locked.id)
      await query.rollback()

      expect(inTransaction.map(r => r.id)).toEqual([prompts[1]!.id])
      expect(outside.map(r => r.id)).toEqual(prompts.map(r => r.id))
    })

    it('excludes an allocated prompt when its owner no longer has a paid membership', async () => {
      const paidOwner = await createTestUser()
      const paidCommunity = await insertTestCommunity({ createdById: paidOwner.id })
      const membership = await createTestMembership({ user_id: paidOwner.id, plan: 'plus' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: paidCommunity.id,
        createdById: paidOwner.id,
        slotAllocated: true,
      })

      await expect(getActiveCommunityAgentPrompts(paidCommunity.id)).resolves.toContainEqual(
        expect.objectContaining({ id: prompt.id }),
      )
      await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))

      await expect(getActiveCommunityAgentPrompts(paidCommunity.id)).resolves.not.toContainEqual(
        expect.objectContaining({ id: prompt.id }),
      )
    })

    it('advances across an ineligible candidate page to a later paid rule', async () => {
      const unpaidOwner = await createTestUser()
      const paidOwner = await createTestUser()
      const community = await insertTestCommunity({ createdById: paidOwner.id })
      const unpaidMembership = await createTestMembership({ user_id: unpaidOwner.id, plan: 'plus' })
      await createTestMembership({ user_id: paidOwner.id, plan: 'plus' })
      const early = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: unpaidOwner.id,
        slotAllocated: true,
      })
      const later = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: paidOwner.id,
        slotAllocated: true,
      })
      await activateTestCommunityAgentPromptHoursAgo(early.id, 2)
      await activateTestCommunityAgentPromptHoursAgo(later.id, 1)
      await updateTestMembershipExpiresAt(unpaidMembership.id, new Date(Date.now() - 60_000))

      const first = await getActiveCommunityAgentPromptPage(community.id, null, 1)
      expect(first.items).toEqual([])
      expect(first.next).not.toBeNull()
      const second = await getActiveCommunityAgentPromptPage(community.id, first.next, 1)
      expect(second.items.map(row => row.id)).toEqual([later.id])
      expect(second.next).toBeNull()
    })
  })
})
