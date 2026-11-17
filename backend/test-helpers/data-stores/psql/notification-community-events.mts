import { write } from '@data-stores/psql'

export function insertNotificationWithBothTargets(userId: string): Promise<unknown> {
  return write(
    `/* insertNotificationWithBothTargets */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, target_path, target_intent)
      VALUES ($1, 'referral_click', 'referral_click', 'two-targets', '/legacy', 'notifications_inbox')`,
    [userId],
  )
}

export function insertNotificationWithEmptyEventKey(userId: string): Promise<unknown> {
  return write(
    `/* insertNotificationWithEmptyEventKey */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params, target_intent)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', '', '{"community_count":1,"joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}', 'notifications_inbox')`,
    [userId],
  )
}

export function insertNotificationWithOversizedEventKey(userId: string): Promise<unknown> {
  return write(
    `/* insertNotificationWithOversizedEventKey */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params, target_intent)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', $2, '{"community_count":1,"joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}', 'notifications_inbox')`,
    [userId, 'x'.repeat(301)],
  )
}

export async function insertDismissedDigestNotification(
  userId: string,
  eventKey: string,
): Promise<void> {
  await write(
    `/* insertDismissedDigestNotification */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params, target_intent)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', $2, '{"community_count":1,"joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}', 'notifications_inbox')`,
    [userId, eventKey],
  )
  await write(
    `/* dismissDigestNotification */ UPDATE notifications SET deleted_at = CURRENT_TIMESTAMP,
      delete_reason = 'user_deleted' WHERE user_id = $1 AND event_key = $2`,
    [userId, eventKey],
  )
}

export function insertDuplicateDigestNotification(
  userId: string,
  eventKey: string,
): Promise<unknown> {
  return write(
    `/* insertDuplicateDigestNotification */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params, target_intent)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', $2, '{"community_count":1,"joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}', 'notifications_inbox')`,
    [userId, eventKey],
  )
}

export async function createNotificationCommunity(
  userId: string,
  name: string,
  slug: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createNotificationCommunity */ INSERT INTO communities (name, slug, created_by_id, created_via)
      VALUES ($1, $2, $3, 'system') RETURNING id`,
    [name, slug, userId],
  )
  return rows[0]!.id
}

export function insertLifecycleNotificationWithIntent(
  userId: string,
  communityId: string,
): Promise<unknown> {
  return write(
    `/* insertLifecycleNotificationWithIntent */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, community_id, params, target_intent)
      VALUES ($1, 'community_role_change', 'community_role_changed', 'lifecycle-intent', $2,
        '{"from_role":"member","to_role":"moderator"}', 'notifications_inbox')`,
    [userId, communityId],
  )
}

export function insertLifecycleNotificationWithoutCommunity(userId: string): Promise<unknown> {
  return write(
    `/* insertLifecycleNotificationWithoutCommunity */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params)
      VALUES ($1, 'community_role_change', 'community_role_changed', 'lifecycle-no-community',
        '{"from_role":"member","to_role":"moderator"}')`,
    [userId],
  )
}

export function insertLifecycleNotificationWithWrongCommunity(userId: string): Promise<unknown> {
  return write(
    `/* insertLifecycleNotificationWithWrongCommunity */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, community_id)
      VALUES ($1, 'community_ownership_transfer', 'community_ownership_received', 'lifecycle-wrong-community', $2)`,
    [userId, userId],
  )
}

export function insertDigestNotificationWithCommunity(
  userId: string,
  communityId: string,
): Promise<unknown> {
  return write(
    `/* insertDigestNotificationWithCommunity */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, community_id, params, target_intent)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', 'digest-community', $2, '{"community_count":1,"joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}', 'notifications_inbox')`,
    [userId, communityId],
  )
}

export function insertDigestNotificationWithEntity(userId: string): Promise<unknown> {
  return write(
    `/* insertDigestNotificationWithEntity */ INSERT INTO notifications
      (user_id, entity_type, kind, event_key, params, target_path)
      VALUES ($1, 'community_activity_digest', 'community_activity_digest', 'digest-entity', '{"community_count":1,"joins":0,"departures":0,"discussions":0,"reviews":0,"data_points":0,"comments":0,"active_posters":0,"total_members":1,"moderation_workload":0}', '/my/notifications')`,
    [userId],
  )
}

export async function insertCommunityMembershipAndGetVacationSuppression(
  communityId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await write<{ suppress: boolean }>(
    `/* insertCommunityMembershipAndGetVacationSuppression */ INSERT INTO community_members
      (community_id, user_id, role) VALUES ($1, $2, 'owner')
      RETURNING should_suppress_community_digests_while_on_vacation AS suppress`,
    [communityId, userId],
  )
  return rows[0]?.suppress ?? false
}
