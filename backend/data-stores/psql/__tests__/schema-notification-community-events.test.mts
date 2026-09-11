import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, write } from '../index.mts'
import { createLocalTestUser } from '../test-helpers/users.mts'

describe('community notification schema invariants', () => {
  afterAll(onGracefulShutdown)

  it('requires exactly one target and a bounded nonempty event key', async () => {
    const user = await createLocalTestUser()
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, title, target_path, target_intent)
        VALUES (${user.id}, 'referral_click', 'two-targets', 'Digest', '/legacy', 'notifications_inbox')`),
    ).rejects.toThrow('chk_notifications__target')
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, title, target_intent)
        VALUES (${user.id}, 'community_activity_digest', '', 'Digest', 'notifications_inbox')`),
    ).rejects.toThrow('chk_notifications__event_key')
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, title, target_intent)
        VALUES (${user.id}, 'community_activity_digest', ${'x'.repeat(301)}, 'Digest', 'notifications_inbox')`),
    ).rejects.toThrow('chk_notifications__event_key')
  })

  it('keeps event-key deduplication unconditional after dismissal', async () => {
    const user = await createLocalTestUser()
    const eventKey = `schema-digest:${user.id}`
    await write(sql`INSERT INTO notifications
      (user_id, entity_type, event_key, title, target_intent)
      VALUES (${user.id}, 'community_activity_digest', ${eventKey}, 'Digest', 'notifications_inbox')`)
    await write(sql`UPDATE notifications SET deleted_at = CURRENT_TIMESTAMP,
      delete_reason = 'user_deleted' WHERE user_id = ${user.id} AND event_key = ${eventKey}`)
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, title, target_intent)
        VALUES (${user.id}, 'community_activity_digest', ${eventKey}, 'Digest', 'notifications_inbox')`),
    ).rejects.toThrow('duplicate key value violates unique constraint')
  })

  it('rejects lifecycle and digest notifications with mismatched target shapes', async () => {
    const user = await createLocalTestUser()
    const { rows: communities } = await write<{ id: string }>(sql`INSERT INTO communities
      (name, slug, created_by_id) VALUES
      ('Notification Shape Community', ${`shape-${user.id}`}, ${user.id}) RETURNING id`)
    const communityId = communities[0]!.id

    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, community_id, title, target_intent)
        VALUES (${user.id}, 'community_application_decision', 'lifecycle-intent', ${communityId},
          'Decision', 'notifications_inbox')`),
    ).rejects.toThrow('chk_notifications__community_event_shape')
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, title, target_entity)
        VALUES (${user.id}, 'community_role_change', 'lifecycle-no-community', 'Role changed',
          jsonb_build_object('__entity_type', 'community', 'id', ${communityId}::text))`),
    ).rejects.toThrow('chk_notifications__community_event_shape')
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, community_id, title, target_entity)
        VALUES (${user.id}, 'community_ownership_transfer', 'lifecycle-wrong-community',
          ${communityId}, 'Ownership transferred',
          jsonb_build_object('__entity_type', 'community', 'id', ${user.id}::text))`),
    ).rejects.toThrow('chk_notifications__community_event_shape')
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, community_id, title, target_intent)
        VALUES (${user.id}, 'community_activity_digest', 'digest-community', ${communityId},
          'Digest', 'notifications_inbox')`),
    ).rejects.toThrow('chk_notifications__community_event_shape')
    await expect(
      write(sql`INSERT INTO notifications
        (user_id, entity_type, event_key, title, target_entity)
        VALUES (${user.id}, 'community_activity_digest', 'digest-entity', 'Digest',
          jsonb_build_object('__entity_type', 'community', 'id', ${communityId}::text))`),
    ).rejects.toThrow('chk_notifications__community_event_shape')
  })

  it('defaults membership vacation suppression to false', async () => {
    const user = await createLocalTestUser()
    const { rows: communities } = await write<{ id: string }>(sql`INSERT INTO communities
      (name, slug, created_by_id) VALUES ('Schema Test Community', ${`schema-${user.id}`}, ${user.id}) RETURNING id`)
    const { rows } = await write<{ suppress: boolean }>(sql`INSERT INTO community_members
      (community_id, user_id, role) VALUES (${communities[0]!.id}, ${user.id}, 'owner')
      RETURNING suppress_community_digests_while_on_vacation AS suppress`)
    expect(rows[0]?.suppress).toBe(false)
  })
})
