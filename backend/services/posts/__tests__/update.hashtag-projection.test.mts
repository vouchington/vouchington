import { beforeAll, describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestUser,
  createTestUserWithAge,
  getPostHashtagSourceContributorIdsForTest,
  getPostHashtagSourcesForTest,
  insertTestTopic,
  restoreUser,
  softDeleteUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getPostByAnyCached } from '../../entity-fetch/get.mts'
import {
  onceEntityListenerActive,
  onceEntityListenerCompleted,
} from '../../../workers/entity-listeners/test-support.mts'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { getOrderedHashtagAliasClaims } from '../hashtags.mts'
import { getPostHashtagOccurrences } from '../hashtag-occurrences.mts'
import { updatePost } from '../update.mts'

describe('updatePost hashtag projection', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('rebuilds hashtag sources from the locked current row when callers hold stale posts', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const original = await createPost(creator, {
      post_type: 'discussion',
      title: `Original #old-title-${suffix}`,
      markdown: `Original #old-markdown-${suffix}`,
    })

    const title = `Updated #new-title-${suffix}`
    const markdown = `Updated #new-markdown-${suffix}`
    await updatePost(creator, original!, { title })
    const updated = await updatePost(creator, original!, { markdown })

    expect(updated).toMatchObject({ title, markdown })
    expect(await getPostHashtagSourcesForTest(original!.id)).toEqual([
      {
        alias: `new-markdown-${suffix}`,
        authored_token: `#new-markdown-${suffix}`,
        source: 'markdown',
      },
      {
        alias: `new-title-${suffix}`,
        authored_token: `#new-title-${suffix}`,
        source: 'title',
      },
    ])
  })

  it('rejects a deleted author before recreating hashtag sources', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createPost(author, {
      post_type: 'discussion',
      title: `Original #before-${suffix}`,
    })

    try {
      await softDeleteUser(author.id)

      await expect(
        updatePost(author, post!, { title: `Attempted #after-${suffix}` }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(getPostHashtagSourcesForTest(post!.id)).resolves.toEqual([
        {
          alias: `before-${suffix}`,
          authored_token: `#before-${suffix}`,
          source: 'title',
        },
      ])
    } finally {
      await restoreUser(author.id)
    }
  })

  it('retains the original contributor for a hashtag unchanged by an administrator edit', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const hashtag = `retained-${suffix}`
    const administrator = await createTestUser({ administrator: true })
    const post = await createPost(creator, {
      post_type: 'discussion',
      title: `Original #${hashtag}`,
    })

    await updatePost(administrator, post!, {
      title: `Administrator edit #${hashtag}`,
    })

    await expect(getPostHashtagSourceContributorIdsForTest(post!.id)).resolves.toEqual([creator.id])
  })

  it('orders alias claims by normalized hashtag key regardless of authored order', () => {
    const suffix = createRandomString(8).toLowerCase()
    const firstHashtag = `first-${suffix}`
    const secondHashtag = `second-${suffix}`

    const claims = [
      getOrderedHashtagAliasClaims(
        getPostHashtagOccurrences({
          post_type: 'discussion',
          title: `First #${firstHashtag} #${secondHashtag}`,
        }),
      ),
      getOrderedHashtagAliasClaims(
        getPostHashtagOccurrences({
          post_type: 'discussion',
          title: `Second #${secondHashtag} #${firstHashtag}`,
        }),
      ),
    ]

    expect(claims).toEqual([
      [
        { key: firstHashtag, authored: `#${firstHashtag}`, source: 'title' },
        { key: secondHashtag, authored: `#${secondHashtag}`, source: 'title' },
      ],
      [
        { key: firstHashtag, authored: `#${firstHashtag}`, source: 'title' },
        { key: secondHashtag, authored: `#${secondHashtag}`, source: 'title' },
      ],
    ])
  })

  it('creates posts with reversed hashtag orders concurrently', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const firstHashtag = `first-${suffix}`
    const secondHashtag = `second-${suffix}`

    const [firstPost, secondPost] = await Promise.all([
      createPost(creator, {
        post_type: 'discussion',
        title: `First #${firstHashtag} #${secondHashtag}`,
      }),
      createPost(creator, {
        post_type: 'discussion',
        title: `Second #${secondHashtag} #${firstHashtag}`,
      }),
    ])

    await expect(getPostHashtagSourcesForTest(firstPost!.id)).resolves.toEqual([
      {
        alias: firstHashtag,
        authored_token: `#${firstHashtag}`,
        source: 'title',
      },
      {
        alias: secondHashtag,
        authored_token: `#${secondHashtag}`,
        source: 'title',
      },
    ])
    await expect(getPostHashtagSourcesForTest(secondPost!.id)).resolves.toEqual([
      {
        alias: firstHashtag,
        authored_token: `#${firstHashtag}`,
        source: 'title',
      },
      {
        alias: secondHashtag,
        authored_token: `#${secondHashtag}`,
        source: 'title',
      },
    ])
  })

  it('schedules a post update for a hashtag-bearing edit', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, {
      post_type: 'discussion',
      title: `Committed update #before-${suffix}`,
    })
    const updateCompleted = onceEntityListenerCompleted('processPostUpdated', post!.id)

    await updatePost(creator, post!, { markdown: `#after-${suffix}` })

    // onceEntityListenerCompleted only resolves once the processPostUpdated job for this exact
    // post ID reaches the queue's completed state, so awaiting it already proves the edit
    // scheduled and ran the listener. Also confirm the hashtag-bearing edit that triggered it
    // actually landed, so a broken enqueue path can't pass silently some other way.
    await updateCompleted
    const sources = await getPostHashtagSourcesForTest(post!.id)
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alias: `after-${suffix}`, source: 'markdown' }),
      ]),
    )
  })

  it('delivers post updates only after explicit topic categories are finalized', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const topicId = await insertTestTopic({
      name: `Listener category ${suffix}`,
      slug: `listener-category-${suffix}`,
      createdById: creator.id,
    })
    const post = await createPost(creator, {
      post_type: 'discussion',
      title: `Listener category update ${suffix}`,
    })
    const listenerActive = onceEntityListenerActive('processPostUpdated', post!.id)
    const update = updatePost(creator, post!, {
      categories: [{ type: 'topic', topic_id: topicId }],
    })

    await listenerActive

    const observedPost = await getPostByAny(post!.id, { readOnly: false })
    expect(observedPost!.post_explicit_categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'topic', topic_id: topicId })]),
    )
    await update
  })

  it('invalidates a cached post after finalizing its hashtag votes', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const post = await createPost(creator, {
      post_type: 'discussion',
      title: `Cached hashtag update ${suffix}`,
    })
    await getPostByAnyCached(post!.id)

    const updated = await updatePost(creator, post!, { markdown: `#cached-${suffix}` })
    const cachedPost = await getPostByAnyCached(post!.id)

    expect(updated!.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: `cached-${suffix}` })]),
    )
    expect(cachedPost!.post_hashtags).toEqual(updated!.post_hashtags)
  })
})
