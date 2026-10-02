import { describe, expect, it } from 'vitest'
import { createRandomString, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { addUserRole } from '../users/roles-permissions.mts'
import { getPrivateUserByAny } from '../users/get.mts'
import {
  createTopicRecommendation,
  rejectTopicRecommendation,
  searchTopicRecommendations,
} from './index.mts'

const createAuthor = async () => ({ ...(await createTestUser()), membership_plan: 'plus' as const })

// The post-created job gives the author's own upvote to the post, which moves its score. A worker
// that handled it between two pages would move a post past the cursor, so these posts skip it.
async function submit(author: Awaited<ReturnType<typeof createAuthor>>) {
  const suffix = createRandomString(8).toLowerCase()
  return createTopicRecommendation(
    author,
    WEB_PROVENANCE,
    {
      markdown: `Why ${suffix}`,
      topic_title: `Search topic ${suffix}`,
      topic_slug: `search-topic-${suffix}`,
    },
    { skipCreatedEvents: true },
  )
}

describe('searchTopicRecommendations', () => {
  it('enriches malformed cursors with the service context', async () => {
    const options = { after: 'malformed-cursor' }

    await expect(searchTopicRecommendations(options)).rejects.toMatchObject({
      status: 400,
      extra: { function: 'searchTopicRecommendations', options },
      tags: { path: 'search-topic-recommendations' },
    })
  })

  it('lists only the recommendations a user submitted, across pages', async () => {
    const author = await createAuthor()
    const other = await createAuthor()
    const mine = [await submit(author), await submit(author), await submit(author)]
    const theirs = await submit(other)

    const first = await searchTopicRecommendations({ created_by_id: author.id, limit: 2 })
    const second = await searchTopicRecommendations({
      created_by_id: author.id,
      limit: 2,
      after: first.page_info.end_cursor!,
    })

    expect(first.results).toHaveLength(2)
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results).toHaveLength(1)
    expect(second.page_info.has_next_page).toBe(false)
    const ids = [...first.results, ...second.results].map(({ id }) => id)
    expect(ids.toSorted()).toEqual(mine.map(({ id }) => id).toSorted())
    expect(ids).not.toContain(theirs.id)
  })

  it('narrows a user’s recommendations by status', async () => {
    const author = await createAuthor()
    const admin = await createTestUser()
    await addUserRole(admin.id, 'administrator')
    const reviewer = await getPrivateUserByAny(admin.id, { readOnly: false })
    const pending = await submit(author)
    const rejected = await submit(author)
    await rejectTopicRecommendation(reviewer!, rejected, 'Not needed')

    const idsFor = async (status?: 'pending' | 'approved' | 'rejected') =>
      (await searchTopicRecommendations({ created_by_id: author.id, status })).results.map(
        ({ id }) => id,
      )

    expect((await idsFor()).toSorted()).toEqual([pending.id, rejected.id].toSorted())
    expect(await idsFor('pending')).toEqual([pending.id])
    expect(await idsFor('rejected')).toEqual([rejected.id])
    expect(await idsFor('approved')).toEqual([])
  })

  it('lists nothing for a user who submitted nothing', async () => {
    const { id } = await createTestUser()

    expect(await searchTopicRecommendations({ created_by_id: id })).toMatchObject({
      results: [],
      page_info: { has_next_page: false },
    })
  })
})
