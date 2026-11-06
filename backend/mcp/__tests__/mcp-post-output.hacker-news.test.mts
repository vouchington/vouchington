import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestPost,
  createTestUser,
  createTestUrlWithHostname,
  deleteTestPost,
  insertHackerNewsReferencesForTest,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertHackerNewsRelatedUrlsForTest } from '@voucha/test-helpers/hacker-news-related-urls'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { toMcpPosts } from '../mcp-post-output.mts'

describe('MCP Hacker News placeholder privacy', () => {
  it.each(['deleted', 'unmoderated'] as const)(
    'omits references from %s comment placeholders on details and summaries',
    async state => {
      await hackerNewsVisibilityConfig.waitForInitialization()
      onTestFinished(
        overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
          references_visible: true,
        }),
      )
      const author = await createTestUser()
      const caller = { ...(await createTestUser()), membership_plan: null }
      const root = await createTestPost({ user: author })
      const comment = await createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: root.id,
        root_post_id: root.id,
        markdown: `Private comment ${crypto.randomUUID()}`,
      })
      await createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: comment.id,
        root_post_id: root.id,
      })
      const urlId = await createTestUrlWithHostname()
      await insertHackerNewsRelatedUrlsForTest(comment.id, author.id, [{ urlId, up: 1 }])
      await insertHackerNewsReferencesForTest({
        url_id: urlId,
        story_count: 1,
        comment_count: 0,
        stories: [
          {
            hacker_news_item_id: 8123456,
            points: 5,
            reply_count: 2,
            posted_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      })
      if (state === 'deleted') await deleteTestPost(comment.id)
      else await setTestPostClearanceStatus(comment.id, 'pending', caller.id)

      const result = await callStructuredMcpTool(
        caller,
        'read_posts',
        optionArgs('details', {
          post_id: comment.id,
        }),
        ['posts:read'],
      )
      const projected = result.post as Record<string, unknown>
      expect(projected).toMatchObject({ id: comment.id, placeholder_state: state, markdown: '' })
      expect(projected.hacker_news_references).toBeUndefined()
      const response = await createRequest().get(`/api/v1/posts/${comment.id}`).expect(200)
      expect(response.body.post.placeholder_state).toBe(state)
      expect(response.body.hacker_news_references).toBeUndefined()

      const hiddenComment =
        state === 'deleted'
          ? { ...comment, deleted_at: new Date() }
          : { ...comment, approved_at: null }
      const [summary] = await toMcpPosts([hiddenComment])
      expect(summary?.placeholder_state).toBe(state)
      expect(summary?.hacker_news_references).toBeUndefined()
    },
  )
})
