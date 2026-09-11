import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import type { PrivateUser } from '@services/users/types'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'
import { getPostByAny } from '../get.mts'

describe('create.link-post.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('createPost resolves title from URL string when url_id given with no title', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const href = `https://example-${random}.com/url-id-fallback`
    const url = await addUrl(null, href)
    const post = await createPost(user, {
      post_type: 'link',
      url_id: url!.id,
    })
    expect(post.post_type).toBe('link')
    expect(post.title).toBe(href)
  })

  it('createPost truncates link post title longer than 255 chars', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://example-${random}.com/long-title`)
    // Repeated phrase with spaces so createSlugFromTitle can find a hyphen break point
    const longTitle = 'Blog post about interesting topics '.repeat(10)
    const post = await createPost(user, {
      post_type: 'link',
      url_id: url!.id,
      title: longTitle,
    })
    expect(post.title.length).toBeLessThanOrEqual(255)
    expect(post.title.length).toBeGreaterThan(0)
  })

  it('createPost rejects link post with non-https url', async () => {
    await expect(
      createPost(user, {
        post_type: 'link',
        url: 'http://example.com/page',
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'url must be a valid https URL',
    })
  })

  it('createPost rejects link post with a nonexistent url_id', async () => {
    await expect(
      createPost(user, {
        post_type: 'link',
        url_id: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'url_id does not exist',
    })
  })

  it('createPost rejects link post with a malformed url', async () => {
    await expect(
      createPost(user, {
        post_type: 'link',
        url: 'https://',
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'url must be a valid https URL',
    })
  })

  it('createPost resolves title from crawl data when url_id given with no title', async () => {
    const urlId = await createTestUrlWithHostname()
    await insertTestCrawl({ urlId, statusCode: 200, markdown: '', title: 'Crawled Article Title' })
    const post = await createPost(user, {
      post_type: 'link',
      url_id: urlId,
    })
    expect(post.title).toBe('Crawled Article Title')
  })

  it('validates hashtag limits after resolving a title from crawl data', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const urlId = await createTestUrlWithHostname()
      const suffix = createRandomString(8)
      const firstHashtag = `first-${suffix}`
      const secondHashtag = `second-${suffix}`
      const slug = `derived-title-tag-limit-${suffix}`
      await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        title: `Crawled Article #${firstHashtag} #${secondHashtag}`,
      })

      await expect(
        createPost(user, {
          post_type: 'link',
          url_id: urlId,
          slug,
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })

      expect(await getPostByAny(slug)).toBeNull()
      expect(await getTopicIdByAnyCached(firstHashtag)).toBeNull()
      expect(await getTopicIdByAnyCached(secondHashtag)).toBeNull()
    } finally {
      restore()
    }
  })
})
