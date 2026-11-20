import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPost } from '@services/posts'
import {
  createTestAgent,
  createTestUser,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { searchPostModerationsByPostIds } from './search-post-moderations.mts'
import { moderationWorkConfig } from './work-limits.mts'

describe('post moderations per post limit', () => {
  it('lists only the configured number of newest moderations per post', async () => {
    const user = await createTestUser()
    const agent = await createTestAgent({ slug: `cap-mod-${randomUUID()}`, activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id })
    const post = await createPost(user, WEB_PROVENANCE, {
      title: `Moderation cap ${randomUUID()}`,
      markdown: 'Content',
      post_type: 'discussion',
    })
    const ids: string[] = []
    for (let index = 0; index < 3; index++)
      ids.push(await insertTestAgentModeration({ postId: post.id, promptId, agentId: agent.id }))
    const newestFirst = ids.toSorted().toReversed()

    const restore = overrideDynamicConfigFieldsForTest(moderationWorkConfig, {
      post_moderations_per_post: 2,
    })
    try {
      const limited = await searchPostModerationsByPostIds([post.id])
      expect(limited.map(row => row.id)).toEqual(newestFirst.slice(0, 2))
      overrideDynamicConfigFieldsForTest(moderationWorkConfig, { post_moderations_per_post: 3 })
      const widened = await searchPostModerationsByPostIds([post.id])
      expect(widened.map(row => row.id)).toEqual(newestFirst)
    } finally {
      restore()
    }
  })
})
