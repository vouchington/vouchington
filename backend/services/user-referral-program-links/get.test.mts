import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import { createUserReferralLink } from './create.mts'
import { getUserReferralLink, getUserReferralLinks } from './get.mts'

describe('get', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let otherUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof getPrivateUserByAny>> | null = null
  let referralProgramId: string | null = null
  let otherReferralProgramId: string | null = null
  let otherReferralHostname: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    regularUser = await createTestUserDirect()
    otherUser = await createTestUserDirect()
    const admin = await createTestUserDirect()
    await addUserRole(admin!.id, 'administrator')
    adminUser = await getPrivateUserByAny(admin!.id)

    const primaryProgramFixture = await createReferralProgramFixture({
      createdById: regularUser!.id,
    })
    referralProgramId = primaryProgramFixture.referralProgramId
    testHostname = primaryProgramFixture.hostname

    const otherProgramFixture = await createReferralProgramFixture({
      createdById: regularUser!.id,
    })
    otherReferralProgramId = otherProgramFixture.referralProgramId
    otherReferralHostname = otherProgramFixture.hostname
  })
  describe('getUserReferralLinks', () => {
    it('uses default options when options are omitted', async () => {
      const link = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/ref/default-options-${Date.now()}`,
        label: 'default options link',
      })
      const result = await getUserReferralLinks(regularUser, regularUser!.id)

      expect(result.results.some(item => item.id === link.id)).toBe(true)
    })

    it('returns links for owner', async () => {
      const link = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/ref/owner-${Date.now()}`,
        label: 'owner link',
      })
      const result = await getUserReferralLinks(regularUser, regularUser!.id, { limit: 10 })

      expect(result.results.some(item => item.id === link.id)).toBe(true)
    })

    it('allows admin to read another user links', async () => {
      const link = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/ref/admin-${Date.now()}`,
        label: 'admin link',
      })
      const result = await getUserReferralLinks(adminUser, regularUser!.id, { limit: 5 })

      expect(result.results.some(item => item.id === link.id)).toBe(true)
    })

    it('rejects unauthenticated and unauthorized access', async () => {
      await expect(getUserReferralLinks(null, regularUser!.id)).rejects.toMatchObject({
        status: 401,
      })

      await expect(getUserReferralLinks(otherUser, regularUser!.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('validates limit and UUID options', async () => {
      await expect(
        getUserReferralLinks(regularUser, regularUser!.id, { limit: 0 }),
      ).rejects.toMatchObject({
        status: 422,
      })

      await expect(
        getUserReferralLinks(regularUser, regularUser!.id, { limit: 101 }),
      ).rejects.toMatchObject({ status: 422 })

      await expect(
        getUserReferralLinks(regularUser, regularUser!.id, { referral_program_id: 'not-a-uuid' }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('paginates with cursor and rejects invalid cursors', async () => {
      const base = Date.now()
      const createdIds = new Set<string>()
      for (let i = 0; i < 3; i++) {
        const link = await createUserReferralLink(regularUser, {
          user_id: regularUser!.id,
          referral_program_id: referralProgramId!,
          url: `https://${testHostname}/ref/cursor-${base}-${i}`,
          label: `cursor-link-${i}`,
        })
        createdIds.add(link.id)
      }

      // Walk all pages with limit 1, collecting IDs
      const seenIds = new Set<string>()
      let cursor: string | undefined
      let pages = 0
      while (true) {
        const page = await getUserReferralLinks(regularUser, regularUser!.id, {
          referral_program_id: referralProgramId!,
          limit: 1,
          after: cursor,
        })
        expect(page.results).toHaveLength(1)
        const id = page.results[0].id
        expect(seenIds.has(id)).toBe(false) // No duplicates
        seenIds.add(id)
        pages++

        if (!page.page_info.has_next_page) break
        expect(page.page_info.end_cursor).toBeTruthy()
        cursor = page.page_info.end_cursor!
      }

      // All 3 created links must appear
      expect(pages).toBeGreaterThanOrEqual(3)
      for (const id of createdIds) {
        expect(seenIds.has(id)).toBe(true)
      }

      // Invalid cursor -> 400
      await expect(
        getUserReferralLinks(regularUser, regularUser!.id, { after: 'not-valid' }),
      ).rejects.toMatchObject({ status: 400 })

      // Wrong cursor type (timestamp cursor instead of simple)
      const wrongTypeCursor = Buffer.from(
        JSON.stringify({ timestamp: Date.now(), id: '00000000-0000-0000-0000-000000000000' }),
      ).toString('base64')
      await expect(
        getUserReferralLinks(regularUser, regularUser!.id, { after: wrongTypeCursor }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('filters by referral_program_id', async () => {
      const base = Date.now()
      const first = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/ref/filter-main-${base}`,
        label: 'main-program-link',
      })
      const second = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: otherReferralProgramId!,
        url: `https://${otherReferralHostname!}/ref/filter-alt-${base}`,
        label: 'other-program-link',
      })
      const filtered = await getUserReferralLinks(regularUser, regularUser!.id, {
        referral_program_id: referralProgramId!,
        limit: 100,
      })
      const ids = filtered.results.map(link => link.id)
      expect(ids).toContain(first.id)
      expect(ids).not.toContain(second.id)
    })

    it('excludes child links (parent_link_id set) from the owner management list', async () => {
      const parent = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/ref/parent-${Date.now()}`,
        label: 'parent link',
      })
      const childUrlId = await createTestUrlWithHostname()
      const childId = await insertTestUserReferralProgramLink({
        userId: regularUser!.id,
        referralProgramId: otherReferralProgramId!,
        urlId: childUrlId,
        parentLinkId: parent.id,
      })

      const result = await getUserReferralLinks(regularUser, regularUser!.id, { limit: 100 })
      const ids = result.results.map(link => link.id)

      expect(ids).toContain(parent.id)
      expect(ids).not.toContain(childId)
    })

    it('excludes links for merged and soft-deleted referral programs', async () => {
      const owner = await createTestUserDirect()
      const suffix = Math.random().toString(36).slice(2, 12)
      const activeProgram = await createReferralProgramFixture({
        createdById: owner.id,
        randomSuffix: `${suffix}active`,
      })
      const mergedProgram = await createReferralProgramFixture({
        createdById: owner.id,
        randomSuffix: `${suffix}merged`,
      })
      const deletedProgram = await createReferralProgramFixture({
        createdById: owner.id,
        randomSuffix: `${suffix}deleted`,
      })
      const activeUrl = `https://${activeProgram.hostname}/ref/active-${suffix}`
      const activeLink = await createUserReferralLink(owner, {
        user_id: owner.id,
        referral_program_id: activeProgram.referralProgramId,
        url: activeUrl,
      })
      await createUserReferralLink(owner, {
        user_id: owner.id,
        referral_program_id: mergedProgram.referralProgramId,
        url: `https://${mergedProgram.hostname}/ref/merged-${suffix}`,
      })
      await createUserReferralLink(owner, {
        user_id: owner.id,
        referral_program_id: deletedProgram.referralProgramId,
        url: `https://${deletedProgram.hostname}/ref/deleted-${suffix}`,
      })

      await mergeTopicForTest(
        mergedProgram.referralProgramId,
        activeProgram.referralProgramId,
        owner.id,
      )
      await softDeleteTopic(deletedProgram.referralProgramId, owner.id)

      const result = await getUserReferralLinks(owner, owner.id, { limit: 100 })

      expect(
        result.results.map(link => ({
          id: link.id,
          referral_program_name: link.referral_program_name,
          referral_program_slug: link.referral_program_slug,
          url: link.url,
        })),
      ).toEqual([
        {
          id: activeLink.id,
          referral_program_name: `Referral Program ${suffix}active`,
          referral_program_slug: `referral-program-${suffix}active`,
          url: activeUrl,
        },
      ])
    })
  })

  describe('getUserReferralLink', () => {
    it('returns link for valid id and null for unknown id', async () => {
      const link = await createUserReferralLink(regularUser, {
        user_id: regularUser!.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/ref/single-${Date.now()}`,
        label: 'single link',
      })
      const found = await getUserReferralLink(link.id)
      expect(found?.id).toBe(link.id)

      const missing = await getUserReferralLink('00000000-0000-0000-0000-000000000000')
      expect(missing).toBeNull()
    })

    it('throws for invalid id format', async () => {
      await expect(getUserReferralLink('bad-id')).rejects.toMatchObject({ status: 422 })
    })
  })
})
