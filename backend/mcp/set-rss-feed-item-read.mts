import assert from 'http-assert'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { markRead, markUnread } from '@services/read-states'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { successSchema } from './output-schema-shapes.mts'

function source(read: boolean): MergedToolSource<{ rss_feed_item_id: string }, { success: true }> {
  return {
    schema: {
      description: read ? 'Mark an existing RSS item read.' : 'Mark an existing RSS item unread.',
      parameters: {
        type: 'object',
        properties: { rss_feed_item_id: { type: 'string', format: 'uuid' } },
        required: ['rss_feed_item_id'],
      },
    },
    meta: {
      audience: 'user',
      title: 'Set RSS Feed Item Read State',
      plan: 'plus',
      requiredScopes: ['rss-feed-items:read', 'rss-feed-items:write'],
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      api: [{ method: read ? 'PUT' : 'DELETE', path: '/api/v1/rss-feed-items/:id/read' }],
      outputSchema: successSchema({}),
    },
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      getDelegatedToolAuthority(user, invocationContext)
      assert(await getRssFeedItemById(args.rss_feed_item_id), 404, 'RSS feed item not found')
      await (read ? markRead : markUnread)(user.id, 'rss_feed_item', args.rss_feed_item_id)
      return { success: true }
    },
  }
}
export const rssReadStateGroup = {
  name: 'set_rss_feed_item_read',
  options: [
    { option: 'read', source: source(true) },
    { option: 'unread', source: source(false) },
  ],
} as const
export default createMergedTool(
  rssReadStateGroup.name,
  'Set RSS Feed Item Read State',
  rssReadStateGroup.options,
)
