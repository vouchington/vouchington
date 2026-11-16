import {
  hydratedCommunityName,
  hydratedPublicText,
  type NotificationT,
  type NotificationText,
  type NotificationTextInput,
} from './notification-text-types'

function roleName(t: NotificationT, role: unknown): string {
  switch (role) {
    case 'owner':
      return t('notifications.kind.role.owner')
    case 'moderator':
      return t('notifications.kind.role.moderator')
    default:
      return t('notifications.kind.role.member')
  }
}

export function communityApplicationApproved(input: NotificationTextInput): NotificationText {
  const community = hydratedCommunityName(input)
  return {
    title: input.t('notifications.kind.community_application_approved.title', { community }),
    body: input.t('notifications.kind.community_application_approved.body', { community }),
  }
}

export function communityApplicationRejected(input: NotificationTextInput): NotificationText {
  const { t, notification, hydration } = input
  const community = hydratedCommunityName(input)
  const reason = hydratedPublicText(hydration, notification.community_application_id)
  return {
    title: t('notifications.kind.community_application_rejected.title', { community }),
    body: reason
      ? t('notifications.kind.community_application_rejected.bodyWithReason', { reason })
      : t('notifications.kind.community_application_rejected.body', { community }),
  }
}

export function communityRoleChanged(input: NotificationTextInput): NotificationText {
  const { t, notification } = input
  const community = hydratedCommunityName(input)
  return {
    title: t('notifications.kind.community_role_changed.title', { community }),
    body: t('notifications.kind.community_role_changed.body', {
      from: roleName(t, notification.params.from_role),
      to: roleName(t, notification.params.to_role),
    }),
  }
}

export function communityOwnershipReceived(input: NotificationTextInput): NotificationText {
  const community = hydratedCommunityName(input)
  return {
    title: input.t('notifications.kind.community_ownership_received.title', { community }),
    body: input.t('notifications.kind.community_ownership_received.body', { community }),
  }
}

export function communityOwnershipTransferredAway(input: NotificationTextInput): NotificationText {
  const community = hydratedCommunityName(input)
  return {
    title: input.t('notifications.kind.community_ownership_transferred_away.title', { community }),
    body: input.t('notifications.kind.community_ownership_transferred_away.body', { community }),
  }
}

export function communityActivityDigest({
  t,
  notification,
  hydration,
}: NotificationTextInput): NotificationText {
  const p = notification.params
  const count = Number(p.community_count ?? 0)
  const joins = Number(p.joins ?? 0)
  const departures = Number(p.departures ?? 0)
  const total = Number(p.total_members ?? 0)
  const active = Number(p.active_posters ?? 0)
  const values = {
    communities:
      count === 1
        ? t('notifications.kind.community_activity_digest.communities.one', { count })
        : t('notifications.kind.community_activity_digest.communities.other', { count }),
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
  const top = notification.top_post_id ? hydration.posts?.[notification.top_post_id] : undefined
  const topCommunity = top?.community_id ? hydration.communities?.[top.community_id] : undefined
  const title = t('notifications.kind.community_activity_digest.title')
  if (!top || !topCommunity) {
    return { title, body: t('notifications.kind.community_activity_digest.body', values) }
  }
  return {
    title,
    body: t('notifications.kind.community_activity_digest.bodyWithTop', {
      ...values,
      top: t('notifications.kind.community_activity_digest.top', {
        community: topCommunity.name,
        title: top.snippet,
        replies: Number(p.top_discussion_replies ?? 0),
      }),
    }),
  }
}
