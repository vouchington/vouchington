import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { getApprovedReviewsForPost } from '@services/communities/publications/get'
import { getPostRecoverySourceUrlIds } from '@services/posts/create/source-url-relation'
import { getPostStoryByPostId } from '@services/stories/get-post-stories'
import {
  createTestUserDirect,
  insertTestPost,
  insertTestPostStory,
  insertTestStory,
  observeTestPostgresQueryPools,
} from '@voucha/test-helpers'
import { recoverPostCreatedEffects } from '../post-created-recovery.mts'

describe('post-created recovery primary reads', () => {
  it('passes primary-read options for every durable recovery input', () => {
    const recoverySource = readFileSync(
      new URL('../post-created-recovery.mts', import.meta.url),
      'utf8',
    )
    expect(recoverySource).toContain('getPostRecoverySourceUrlIds(post.id, { readOnly: false })')
    expect(recoverySource).toContain('getApprovedReviewsForPost(postId, { readOnly: false })')
    expect(recoverySource).toContain('getUrlById(urlId, { readOnly: false })')
    expect(recoverySource).toContain('getPostStoryByPostId(post.id, { readOnly: false })')
  })

  it('routes durable recovery queries exclusively through the write pool', async () => {
    const postId = randomUUID()
    const observed = await Promise.all([
      observeTestPostgresQueryPools('/* getPostRecoverySourceUrlIds */', () =>
        getPostRecoverySourceUrlIds(postId, { readOnly: false }),
      ),
      observeTestPostgresQueryPools('/* getApprovedReviewsForPost */', () =>
        getApprovedReviewsForPost(postId, { readOnly: false }),
      ),
      observeTestPostgresQueryPools('/* getPostStoryByPostId */', () =>
        getPostStoryByPostId(postId, { readOnly: false }),
      ),
    ])

    expect(observed.map(result => result.pools)).toEqual([['write'], ['write'], ['write']])
  })

  it('propagates a recovered story enqueue failure for checkpoint retry', async () => {
    const user = await createTestUserDirect()
    const story = await insertTestStory({ title: 'Recovery enqueue retry' })
    const postId = await insertTestPost({
      title: 'Recovery enqueue retry',
      slug: randomUUID(),
      createdById: user.id,
      markdown: '',
      postType: 'story',
    })
    await insertTestPostStory(postId, story.id, user.id)
    const enqueueError = new Error('story queue unavailable')
    const enqueueStoryPostAgent = vi
      .fn<(postId: string) => Promise<void>>()
      .mockRejectedValue(enqueueError)

    await expect(
      recoverPostCreatedEffects({ id: postId, post_type: 'story' }, { enqueueStoryPostAgent }),
    ).rejects.toBe(enqueueError)
    expect(enqueueStoryPostAgent).toHaveBeenCalledWith(postId)
  })
})
