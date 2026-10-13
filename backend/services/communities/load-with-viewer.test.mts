import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createApplication } from './applications/create.mts'
import { getCommunityMember } from './members/get.mts'
import { getCommunityWithViewer, loadCommunityWithViewer } from './load-with-viewer.mts'

describe('load-with-viewer', () => {
  const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  })

  it('returns the membership row exactly as getCommunityMember reads it', async () => {
    const inserted = await insertTestCommunity({ createdById: owner.id })
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: inserted.id, userId: member.id })

    const loaded = await loadCommunityWithViewer(inserted.id, member.id)

    expect(loaded.membership).toEqual(await getCommunityMember(inserted.id, member.id))
    expect(loaded.membership?.created_at).toBeInstanceOf(Date)
    expect(loaded.community.id).toBe(inserted.id)
    expect(loaded.hasPendingApplication).toBe(false)
  })

  it('returns a null membership for a non-member and for an anonymous viewer', async () => {
    const inserted = await insertTestCommunity({ createdById: owner.id })
    const stranger = await createTestUser()

    expect((await loadCommunityWithViewer(inserted.id, stranger.id)).membership).toBeNull()
    expect((await loadCommunityWithViewer(inserted.id, null)).membership).toBeNull()
  })

  it('ignores a removed membership', async () => {
    const inserted = await insertTestCommunity({ createdById: owner.id })
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: inserted.id, userId: member.id })
    await removeTestCommunityMember(inserted.id, member.id)

    expect((await loadCommunityWithViewer(inserted.id, member.id)).membership).toBeNull()
  })

  it('finds the community by id, slug, and upper-cased slug with the same membership', async () => {
    const inserted = await insertTestCommunity({ createdById: owner.id })
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: inserted.id, userId: member.id })

    const loaded = await Promise.all(
      [inserted.id, inserted.slug, inserted.slug.toUpperCase()].map(idOrSlug =>
        loadCommunityWithViewer(idOrSlug, member.id),
      ),
    )

    for (const result of loaded) {
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership?.user_id).toBe(member.id)
    }
  })

  it('reports a pending application only when the detail route asks for it', async () => {
    const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    await insertTestCommunityMember({ communityId: inserted.id, userId: owner.id, role: 'owner' })
    const applicant = await createTestUser()
    await createApplication(applicant.id, WEB_PROVENANCE, inserted.id, {})

    const asked = await loadCommunityWithViewer(inserted.id, applicant.id, undefined, {
      includePendingApplication: true,
    })
    const notAsked = await loadCommunityWithViewer(inserted.id, applicant.id)

    expect(asked.hasPendingApplication).toBe(true)
    expect(asked.membership).toBeNull()
    expect(notAsked.hasPendingApplication).toBe(false)
  })

  it('returns null from getCommunityWithViewer and throws 404 from loadCommunityWithViewer when missing', async () => {
    expect(await getCommunityWithViewer(NON_EXISTENT_UUID, owner.id)).toBeNull()
    await expect(loadCommunityWithViewer('no-such-community-slug', null)).rejects.toMatchObject({
      status: 404,
      message: 'Community not found',
    })
  })
})
