import { describe, it, expect } from 'vitest'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { storyRelatedItemsConfig } from './story-related-items-config.mts'
import { getStoryPreviews } from './story-previews.mts'
import { getStoryMemberPagesBatch } from '@services/feeds/rss-feed-items/story-member-pages'

describe('story member cursors', () => {
  it('continues a preview with a larger page without gaps or duplicates', async () => {
    const fixture = await createTestStoryMembers(26)
    const request = { story_id: fixture.story.id, exclude_item_id: fixture.itemIds[1] }
    const restore = overrideDynamicConfigFieldsForTest(storyRelatedItemsConfig, {
      preview_limit: 1,
    })
    let first
    try {
      first = (
        await getStoryPreviews(null, [{ id: request.exclude_item_id, story_id: request.story_id }])
      )[fixture.story.id]!
    } finally {
      restore()
    }
    const second = (
      await getStoryMemberPagesBatch(null, [{ ...request, after: first.page_info.end_cursor! }], {
        limit: 25,
      })
    )[fixture.story.id]!
    expect([...first.item_ids, ...second.item_ids]).toEqual(
      fixture.itemIds.filter(id => id !== request.exclude_item_id),
    )
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('rejects changed story, viewer, administrator access or excluded primary scopes', async () => {
    const [fixture, other, user, differentUser] = await Promise.all([
      createTestStoryMembers(4),
      createTestStoryMembers(0),
      createTestUser(),
      createTestUser(),
    ])
    const request = { story_id: fixture.story.id, exclude_item_id: fixture.itemIds[0] }
    const first = (await getStoryMemberPagesBatch(user, [request], { limit: 1 }))[fixture.story.id]!
    const after = first.page_info.end_cursor!
    for (const [viewer, changed] of [
      [user, { ...request, story_id: other.story.id }],
      [differentUser, request],
      [null, request],
      [{ ...user, roles: [...user.roles, 'administrator'] }, request],
      [user, { ...request, exclude_item_id: fixture.itemIds[1] }],
    ] as const) {
      await expect(
        getStoryMemberPagesBatch(viewer, [{ ...changed, after }], { limit: 3 }),
      ).rejects.toMatchObject({ status: 400 })
    }
  })

  it('rejects malformed and unscoped cursor tokens', async () => {
    const fixture = await createTestStoryMembers(1)
    for (const after of [
      'invalid',
      fixture.itemIds[0]!,
      Buffer.from(JSON.stringify({ id: fixture.itemIds[0] })).toString('base64'),
    ]) {
      await expect(
        getStoryMemberPagesBatch(null, [{ story_id: fixture.story.id, after }], { limit: 3 }),
      ).rejects.toMatchObject({ status: 400 })
    }
  })
})
