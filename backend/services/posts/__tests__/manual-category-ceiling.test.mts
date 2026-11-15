import { describe, expect, it } from 'vitest'
import { createTestUser, createRandomString, WEB_PROVENANCE } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { getPostByAny } from '../get.mts'

const rejected = { status: 403, code: TAG_LIMIT_REACHED }

describe('manual post category ceiling', () => {
  it('rejects an oversized administrator input before resolving its topic IDs', async () => {
    const creator = await createTestUser({ administrator: true })
    await expect(
      createPost(creator, WEB_PROVENANCE, {
        title: 'Oversized category input',
        categories: Array.from({ length: 21 }, () => ({
          type: 'topic' as const,
          topic_id: 'invalid-topic-id',
        })),
      }),
    ).rejects.toMatchObject(rejected)
  })

  it('caps administrator create and edits across explicit and body hashtags', async () => {
    const creator = await createTestUser({ administrator: true })
    const suffix = createRandomString(8).toLowerCase()
    const categories = Array.from({ length: 20 }, (_, index) => ({
      type: 'hashtag' as const,
      hashtag: `#ceiling-${suffix}-${index}`,
    }))
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Administrator category ceiling ${suffix}`,
      categories,
    })
    expect(post).toBeTruthy()
    await expect(
      updatePost(creator, post!, { markdown: `#extra-${suffix}` }),
    ).rejects.toMatchObject(rejected)
    await expect(
      updatePost(creator, post!, {
        categories: [...categories, { type: 'hashtag', hashtag: '#extra' }],
      }),
    ).rejects.toMatchObject(rejected)
    expect((await getPostByAny(post!.id))!.markdown).toBe(post!.markdown)
  })

  it('does not let stale tier configuration raise the standing ceiling', async () => {
    const creator = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { just_joined: 100 })
    try {
      await expect(
        createPost(creator, WEB_PROVENANCE, {
          title: 'Stale tier category ceiling',
          markdown: Array.from({ length: 21 }, (_, index) => `#ceiling-${index}`).join(' '),
        }),
      ).rejects.toMatchObject(rejected)
    } finally {
      restore()
    }
  })
})
