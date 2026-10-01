import { describe, it, expect } from 'vitest'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { enableQueryCapture, stopTestQueryCapture } from '@voucha/test-helpers/query-capture'
import { getStoryMemberPagesBatch } from '@services/feeds/rss-feed-items/story-member-pages'
import { getStoryPreviewRequests } from './story-previews.mts'

describe('bounded story members', () => {
  it.each([0, 1, 3, 4, 25, 26, 2000])('bounds previews and detail at %i members', async count => {
    const fixture = await createTestStoryMembers(count)
    for (const limit of [3, 25]) {
      const pages = await getStoryMemberPagesBatch(null, [{ story_id: fixture.story.id }], {
        limit,
      })
      const page = pages[fixture.story.id]!
      expect(page.item_ids).toEqual(fixture.itemIds.slice(0, limit))
      expect(page.page_info.has_next_page).toBe(count > limit)
      expect(page.page_info.end_cursor === null).toBe(count <= limit)
      expect(page.page_info.start_cursor === null).toBe(count === 0)
    }
  })

  it('batches multiple stories without sharing exclusions or lookahead', async () => {
    const [first, second, empty] = await Promise.all([
      createTestStoryMembers(4),
      createTestStoryMembers(1),
      createTestStoryMembers(0),
    ])
    enableQueryCapture()
    let pages
    try {
      pages = await getStoryMemberPagesBatch(
        null,
        [
          { story_id: first.story.id, exclude_item_id: first.itemIds[0] },
          { story_id: second.story.id },
          { story_id: empty.story.id },
        ],
        { limit: 3 },
      )
    } finally {
      const queries = stopTestQueryCapture()
      expect(
        queries.filter(query => query.text.includes('/* getStoryMemberPagesBatch */')),
      ).toHaveLength(1)
    }
    expect(pages[first.story.id]!.item_ids).toEqual(first.itemIds.slice(1))
    expect(pages[first.story.id]!.page_info.has_next_page).toBe(false)
    expect(pages[second.story.id]!.item_ids).toEqual(second.itemIds)
    expect(pages[empty.story.id]!.item_ids).toEqual([])
  })

  it.each([0, 2, 4])('excludes primary at position %i before limiting', async position => {
    const fixture = await createTestStoryMembers(5)
    const excluded = fixture.itemIds[position]!
    const pages = await getStoryMemberPagesBatch(
      null,
      [{ story_id: fixture.story.id, exclude_item_id: excluded }],
      { limit: 3 },
    )
    expect(pages[fixture.story.id]!.item_ids).toEqual(
      fixture.itemIds.filter(id => id !== excluded).slice(0, 3),
    )
    expect(pages[fixture.story.id]!.page_info.has_next_page).toBe(true)
  })

  it('selects the first direct primary per story and keeps shares standalone', () => {
    expect(
      getStoryPreviewRequests([
        { id: 'delivery', entity_id: 'shared', story_id: 'story', delivery_type: 'share' },
        { id: 'primary', story_id: 'story', delivery_type: 'direct' },
        { id: 'later', story_id: 'story', delivery_type: 'direct' },
        { id: 'standalone', story_id: null },
      ]),
    ).toEqual([{ story_id: 'story', exclude_item_id: 'primary' }])
  })
})
