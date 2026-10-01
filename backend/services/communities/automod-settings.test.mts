import { describe, expect, it } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { getCommunity } from './get.mts'
import { updateCommunityAutomodSettings } from './automod-settings.mts'

describe('updateCommunityAutomodSettings', () => {
  it('defaults a community to recording flags only', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })

    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('lets a platform administrator change the action without a membership', async () => {
    const [owner, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    const community = await insertTestCommunity({ createdById: owner.id })

    const updated = await updateCommunityAutomodSettings(administrator, community.id, {
      automod_action: 'unpublish',
    })

    expect(updated.automod_action).toBe('unpublish')
    expect((await getCommunity(community.id))?.automod_action).toBe('unpublish')
  })

  it('lets a community moderator change the action, using the membership the caller loaded', async () => {
    const [owner, moderator] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })

    const updated = await updateCommunityAutomodSettings(
      moderator,
      community.id,
      { automod_action: 'review_queue' },
      membership,
    )

    expect(updated.automod_action).toBe('review_queue')
  })

  it('refuses a user who is not a moderator, and changes nothing', async () => {
    const [owner, outsider] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })

    await expect(
      updateCommunityAutomodSettings(outsider, community.id, { automod_action: 'unpublish' }),
    ).rejects.toMatchObject({ status: 403 })

    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('refuses an archived community', async () => {
    const owner = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: owner.id })
    await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })

    await expect(
      updateCommunityAutomodSettings(owner, community.id, { automod_action: 'unpublish' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('refuses an action that is not one of the three choices, including the retired none', async () => {
    const owner = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: owner.id })

    for (const automod_action of ['none', '', 'Unpublish']) {
      await expect(
        updateCommunityAutomodSettings(owner, community.id, {
          automod_action: automod_action as 'unpublish',
        }),
      ).rejects.toMatchObject({ status: 422 })
    }
    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('refuses a community that does not exist', async () => {
    const administrator = await createTestUser({ administrator: true })

    await expect(
      updateCommunityAutomodSettings(administrator, randomUUID(), { automod_action: 'unpublish' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
