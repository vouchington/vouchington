import type { Notification, NotificationResult } from '@services/notifications'
import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
import { externalText, iso, sanitizedTitle } from './mcp-read-output.mts'
import { routePropertySchema, routeResponseSchema } from './route-response-schema.mts'

const UNREAD_SUMMARY = {
  method: 'GET',
  path: '/api/v1/my/notifications/unread',
} as const satisfies ToolApiEndpoint

type NotificationCommunity = { id: string; name: string; slug: string }

type DatedFields = 'read_at' | 'pushed_at' | 'created_at' | 'updated_at'

/** A notification as an MCP client reads it: its timestamps are ISO strings, its text is clean. */
export type McpNotification = Omit<Notification, DatedFields> & {
  read_at: string | null
  pushed_at: string | null
  created_at: string
  updated_at: string
}

/** The list of notification references and the records they point at, as the REST routes return them. */
export type McpNotificationBody = {
  results: { __entity_type: 'notification'; id: string; read_at: string | null }[]
  notifications: Record<string, McpNotification>
  communities: Record<string, NotificationCommunity>
}

type NotificationSource = {
  results: NotificationResult[]
  notifications: Record<string, Notification>
  communities: Record<string, NotificationCommunity>
}

const isoOrNull = (value: Date | string | null): string | null => (value ? iso(value) : null)

/**
 * The title and the actor label can carry another user's words (a post title, a display name) and
 * the body can quote them, so the title and label are sanitized like titles and the body is
 * sanitized and fenced as external content. An empty body stays an empty string, the REST type.
 */
async function toMcpNotification(notification: Notification): Promise<McpNotification> {
  const [title, body, actorLabel] = await Promise.all([
    sanitizedTitle(notification.title),
    externalText(notification.body, 'notification', 'notification_body'),
    notification.actor_label === null ? null : sanitizedTitle(notification.actor_label),
  ])
  return {
    ...notification,
    title,
    body: body ?? '',
    actor_label: actorLabel,
    read_at: isoOrNull(notification.read_at),
    pushed_at: isoOrNull(notification.pushed_at),
    created_at: iso(notification.created_at),
    updated_at: iso(notification.updated_at),
  }
}

async function toMcpCommunity(community: NotificationCommunity): Promise<NotificationCommunity> {
  return { ...community, name: await sanitizedTitle(community.name) }
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

/** The notification references, notifications and communities of a REST body, with clean text. */
export async function toMcpNotificationBody(
  source: NotificationSource,
): Promise<McpNotificationBody> {
  const [notifications, communities] = await Promise.all([
    mapRecord(source.notifications, toMcpNotification),
    mapRecord(source.communities, toMcpCommunity),
  ])
  return {
    results: source.results.map(result => ({
      __entity_type: 'notification',
      id: result.id,
      read_at: isoOrNull(result.read_at),
    })),
    notifications,
    communities,
  }
}

/**
 * The output properties both notification tools share, from the unread summary's generated
 * contract. The list route documents the same three inline, and a test pins them to it.
 */
export function notificationOutputProperties() {
  const summary = routeResponseSchema(UNREAD_SUMMARY)
  return {
    results: routePropertySchema(summary, 'results'),
    notifications: routePropertySchema(summary, 'notifications'),
    communities: routePropertySchema(summary, 'communities'),
  }
}

export const unreadCountSchema = () =>
  routePropertySchema(routeResponseSchema(UNREAD_SUMMARY), 'unread_count')
