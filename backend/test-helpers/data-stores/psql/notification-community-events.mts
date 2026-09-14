import { write } from '@data-stores/psql'

export function insertNotificationWithBothTargets(userId: string): Promise<unknown> {
  return write(
    `/* insertNotificationWithBothTargets */ INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_path, target_intent)
      VALUES ($1, 'referral_click', 'two-targets', 'Digest', '/legacy', 'notifications_inbox')`,
    [userId],
  )
}

export function insertNotificationWithEmptyEventKey(userId: string): Promise<unknown> {
  return write(
    `/* insertNotificationWithEmptyEventKey */ INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_intent)
      VALUES ($1, 'community_activity_digest', '', 'Digest', 'notifications_inbox')`,
    [userId],
  )
}

export function insertNotificationWithOversizedEventKey(userId: string): Promise<unknown> {
  return write(
    `/* insertNotificationWithOversizedEventKey */ INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_intent)
      VALUES ($1, 'community_activity_digest', $2, 'Digest', 'notifications_inbox')`,
    [userId, 'x'.repeat(301)],
  )
}

export async function insertDismissedDigestNotification(
  userId: string,
  eventKey: string,
): Promise<void> {
  await write(
    `/* insertDismissedDigestNotification */ INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_intent)
      VALUES ($1, 'community_activity_digest', $2, 'Digest', 'notifications_inbox')`,
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
      (user_id, entity_type, event_key, title, target_intent)
      VALUES ($1, 'community_activity_digest', $2, 'Digest', 'notifications_inbox')`,
    [userId, eventKey],
  )
}

export async function createNotificationCommunity(
  userId: string,
  name: string,
  slug: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createNotificationCommunity */ INSERT INTO communities (name, slug, created_by_id)
      VALUES ($1, $2, $3) RETURNING id`,
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
      (user_id, entity_type, event_key, community_id, title, target_intent)
      VALUES ($1, 'community_application_decision', 'lifecycle-intent', $2, 'Decision', 'notifications_inbox')`,
    [userId, communityId],
  )
}

export function insertLifecycleNotificationWithoutCommunity(
  userId: string,
  communityId: string,
): Promise<unknown> {
  return write(
    `/* insertLifecycleNotificationWithoutCommunity */ INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_entity)
      VALUES ($1, 'community_role_change', 'lifecycle-no-community', 'Role changed',
        jsonb_build_object('__entity_type', 'community', 'id', $2::text))`,
    [userId, communityId],
  )
}

export function insertLifecycleNotificationWithWrongCommunity(
  userId: string,
  communityId: string,
): Promise<unknown> {
  return write(
    `/* insertLifecycleNotificationWithWrongCommunity */ INSERT INTO notifications
      (user_id, entity_type, event_key, community_id, title, target_entity)
      VALUES ($1, 'community_ownership_transfer', 'lifecycle-wrong-community', $2,
        'Ownership transferred', jsonb_build_object('__entity_type', 'community', 'id', $3::text))`,
    [userId, communityId, userId],
  )
}

export function insertDigestNotificationWithCommunity(
  userId: string,
  communityId: string,
): Promise<unknown> {
  return write(
    `/* insertDigestNotificationWithCommunity */ INSERT INTO notifications
      (user_id, entity_type, event_key, community_id, title, target_intent)
      VALUES ($1, 'community_activity_digest', 'digest-community', $2, 'Digest', 'notifications_inbox')`,
    [userId, communityId],
  )
}

export function insertDigestNotificationWithEntity(
  userId: string,
  communityId: string,
): Promise<unknown> {
  return write(
    `/* insertDigestNotificationWithEntity */ INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_entity)
      VALUES ($1, 'community_activity_digest', 'digest-entity', 'Digest',
        jsonb_build_object('__entity_type', 'community', 'id', $2::text))`,
    [userId, communityId],
  )
}

export async function insertCommunityMembershipAndGetVacationSuppression(
  communityId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await write<{ suppress: boolean }>(
    `/* insertCommunityMembershipAndGetVacationSuppression */ INSERT INTO community_members
      (community_id, user_id, role) VALUES ($1, $2, 'owner')
      RETURNING suppress_community_digests_while_on_vacation AS suppress`,
    [communityId, userId],
  )
  return rows[0]?.suppress ?? false
}
