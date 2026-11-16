import type { NotificationTranslate, Source } from './render-notification-types.mts'
import type { NotificationHydration } from './types.mts'

const PREFIX = 'notifications.kind.'

export function digestBody(
  t: NotificationTranslate,
  notification: Source,
  hydration: NotificationHydration,
): string {
  const p = notification.params
  const base = `${PREFIX}community_activity_digest`
  const count = Number(p.community_count ?? 0)
  const joins = Number(p.joins ?? 0)
  const departures = Number(p.departures ?? 0)
  const total = Number(p.total_members ?? 0)
  const active = Number(p.active_posters ?? 0)
  const values = {
    communities: t(`${base}.communities.${count === 1 ? 'one' : 'other'}`, { count }),
    joins,
    departures,
    net: joins - departures,
    total,
    discussions: Number(p.discussions ?? 0),
    reviews: Number(p.reviews ?? 0),
    dataPoints: Number(p.data_points ?? 0),
    comments: Number(p.comments ?? 0),
    active,
    rate: total === 0 ? 0 : Math.round((active * 100) / total),
    moderation: Number(p.moderation_workload ?? 0),
  }
  const top = notification.top_post_id ? hydration.posts[notification.top_post_id] : undefined
  const topCommunity = top?.community_id ? hydration.communities[top.community_id] : undefined
  if (!top || !topCommunity) return t(`${base}.body`, values)
  return t(`${base}.bodyWithTop`, {
    ...values,
    top: t(`${base}.top`, {
      community: topCommunity.name,
      title: top.snippet,
      replies: Number(p.top_discussion_replies ?? 0),
    }),
  })
}
