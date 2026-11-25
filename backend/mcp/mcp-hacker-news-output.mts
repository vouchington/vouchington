import { componentSchema } from './route-response-schema.mts'
import { objectSchema } from '@vouchington/mcp-server/schema'

/** Neutral reference facts use the same counts and capped rows as REST. */
export function mcpHackerNewsReferenceSchema(details = false) {
  const counts = componentSchema('HackerNewsReferenceCounts')
  if (!details) return counts
  return objectSchema({
    ...(counts.properties as Record<string, Record<string, unknown>>),
    stories: {
      type: 'array',
      items: objectSchema({
        hacker_news_item_id: { type: 'number' },
        points: { type: 'number' },
        reply_count: { type: 'number' },
        posted_at: { type: 'string' },
      }),
    },
    comments: {
      type: 'array',
      items: objectSchema({
        hacker_news_item_id: { type: 'number' },
        parent_story_item_id: { type: 'number' },
        posted_at: { type: 'string' },
      }),
    },
  })
}
