import type {
  Notification,
  NotificationHydration,
  NotificationResult,
} from '@services/notifications'
import type { ToolApiEndpoint } from '@vouchington/mcp-server/types'
import { iso } from './mcp-read-output.mts'
import { sanitizeTitle, wrapExternalText } from '@vouchington/mcp-server/untrusted'
import { routeResponseSchema } from './route-response-schema.mts'
import { routePropertySchema } from '@vouchington/mcp-server/schema'

const UNREAD_SUMMARY = {
  method: 'GET',
  path: '/api/v1/my/notifications/unread',
} as const satisfies ToolApiEndpoint

type DatedFields = 'read_at' | 'pushed_at' | 'created_at' | 'updated_at'

type JsonSchema = Record<string, unknown>

/**
 * A notification as an MCP client reads it: its timestamps are ISO strings and it has no
 * `target_path`. Its facts are the `kind`, `params` and ids; the user-authored text it points at
 * (usernames, snippets, moderator responses) arrives in the hydration maps, sanitized. That field is a frontend route; what a notification is about comes as
 * the structured `target_entity`, `target_intent` and the ids of the records it points at.
 */
type McpNotification = Omit<Notification, DatedFields | 'target_path'> & {
  read_at: string | null
  pushed_at: string | null
  created_at: string
  updated_at: string
}

/** The list of notification references and the records they point at, as the REST routes return them. */
export type McpNotificationBody = {
  results: { __entity_type: 'notification'; id: string; read_at: string | null }[]
  notifications: Record<string, McpNotification>
} & NotificationHydration

type NotificationSource = {
  results: NotificationResult[]
  notifications: Record<string, Notification>
} & NotificationHydration

const isoOrNull = (value: Date | string | null): string | null => (value ? iso(value) : null)

function toMcpNotification(notification: Notification): McpNotification {
  const { target_path: _frontendRoute, ...structured } = notification
  return {
    ...structured,
    read_at: isoOrNull(notification.read_at),
    pushed_at: isoOrNull(notification.pushed_at),
    created_at: iso(notification.created_at),
    updated_at: iso(notification.updated_at),
  }
}

async function mapRecord<TIn, TOut>(
  record: Record<string, TIn>,
  convert: (value: TIn) => Promise<TOut>,
): Promise<Record<string, TOut>> {
  const entries = await Promise.all(
    Object.entries(record).map(async ([key, value]) => [key, await convert(value)] as const),
  )
  return Object.fromEntries(entries)
}

/** The notification references, notifications and hydration maps of a REST body, with clean text. */
export async function toMcpNotificationBody(
  source: NotificationSource,
): Promise<McpNotificationBody> {
  const [communities, actors, posts, rssFeedItems, publicTexts] = await Promise.all([
    mapRecord(source.communities, async community => ({
      ...community,
      name: await sanitizeTitle(community.name),
    })),
    mapRecord(source.actors, async actor => ({
      ...actor,
      username: await sanitizeTitle(actor.username),
    })),
    mapRecord(source.posts, async post => ({
      ...post,
      snippet:
        (await wrapExternalText(post.snippet, 'notification', 'notification_post_snippet')) ?? '',
    })),
    mapRecord(source.rss_feed_items, async item => ({
      ...item,
      feed_name: await sanitizeTitle(item.feed_name),
      snippet:
        (await wrapExternalText(item.snippet, 'notification', 'notification_rss_snippet')) ?? '',
    })),
    mapRecord(
      source.public_texts,
      async text =>
        (await wrapExternalText(text, 'notification', 'notification_public_text')) ?? '',
    ),
  ])
  return {
    results: source.results.map(result => ({
      __entity_type: 'notification',
      id: result.id,
      read_at: isoOrNull(result.read_at),
    })),
    notifications: Object.fromEntries(
      Object.entries(source.notifications).map(([id, value]) => [id, toMcpNotification(value)]),
    ),
    communities,
    actors,
    posts,
    rss_feed_items: rssFeedItems,
    copyright_notices: source.copyright_notices,
    public_texts: publicTexts,
  }
}

/** The documented record map with `target_path` dropped from each notification, as `toMcpNotification` does. */
function withoutTargetPath(notifications: JsonSchema): JsonSchema {
  const item = notifications['additionalProperties'] as JsonSchema
  const keep = ([key]: [string, unknown]) => key !== 'target_path'
  return {
    ...notifications,
    additionalProperties: {
      ...item,
      properties: Object.fromEntries(Object.entries(item['properties'] as JsonSchema).filter(keep)),
      required: (item['required'] as string[]).filter(key => key !== 'target_path'),
    },
  }
}

/**
 * The output properties both notification tools share, from the unread summary's generated
 * contract. The list route documents the same three inline, and a test pins them to it, apart from
 * the `target_path` each notification leaves out.
 */
export function notificationOutputProperties() {
  const summary = routeResponseSchema(UNREAD_SUMMARY)
  return {
    results: routePropertySchema(summary, 'results'),
    notifications: withoutTargetPath(routePropertySchema(summary, 'notifications')),
    communities: routePropertySchema(summary, 'communities'),
    actors: routePropertySchema(summary, 'actors'),
    posts: routePropertySchema(summary, 'posts'),
    rss_feed_items: routePropertySchema(summary, 'rss_feed_items'),
    copyright_notices: routePropertySchema(summary, 'copyright_notices'),
    public_texts: routePropertySchema(summary, 'public_texts'),
  }
}

export const unreadCountSchema = () =>
  routePropertySchema(routeResponseSchema(UNREAD_SUMMARY), 'unread_count')
