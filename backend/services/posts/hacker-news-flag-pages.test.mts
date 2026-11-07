import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestUrlWithHostname,
  createTestPost,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { pagePostHackerNewsFlags } from './hacker-news-flag-pages.mts'

describe('Hacker News URL maintenance pages', () => {
  it('includes soft-deleted own-link posts in URL-triggered flag maintenance pages', async () => {
    const user = await createTestUser()
    const urlId = await createTestUrlWithHostname()
    const post = await createTestPost({ user, post_type: 'link', url_id: urlId })
    await setPostDeletedForTest(post.id)

    expect(
      await pagePostHackerNewsFlags(
        'own',
        urlId,
        '00000000-0000-7000-8000-000000000000',
        post.id,
        10,
      ),
    ).toEqual([post.id])
  })
})
