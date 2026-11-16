import { write, type TransactionQuery } from '@data-stores/psql'

export function insertRoleChangeWithRoles(
  userId: string,
  communityId: string,
  roles: { from: string; to: string },
): Promise<unknown> {
  return write(
    `/* insertRoleChangeWithRoles */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, community_id, params)
      VALUES ($1, 'community_role_change', 'community_role_changed', $2, $3,
        jsonb_build_object('from_role', $4::text, 'to_role', $5::text))`,
    [userId, `role-${roles.from}-${roles.to}`, communityId, roles.from, roles.to],
  )
}

export function insertDigestWithStringCount(userId: string): Promise<unknown> {
  return write(
    `/* insertDigestWithStringCount */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params, target_intent)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', 'digest-string-count',
        '{"community_count":"1","joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}',
        'notifications_inbox')`,
    [userId],
  )
}

export function insertCopyrightNotificationWithoutWorkItem(
  query: TransactionQuery,
  userId: string,
  noticeId: string,
): Promise<unknown> {
  return query(
    `/* insertCopyrightNotificationWithoutWorkItem */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, copyright_notice_id, target_intent)
      VALUES ($1, 'copyright_notice', 'copyright_status_update', 'copyright-no-work-item', $2,
        'notifications_inbox')`,
    [userId, noticeId],
  )
}
