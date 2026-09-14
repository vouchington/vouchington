import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  createNotificationCommunity,
  insertCommunityMembershipAndGetVacationSuppression,
  insertDigestNotificationWithCommunity,
  insertDigestNotificationWithEntity,
  insertDismissedDigestNotification,
  insertDuplicateDigestNotification,
  insertLifecycleNotificationWithIntent,
  insertLifecycleNotificationWithoutCommunity,
  insertLifecycleNotificationWithWrongCommunity,
  insertNotificationWithBothTargets,
  insertNotificationWithEmptyEventKey,
  insertNotificationWithOversizedEventKey,
} from '../../../test-helpers/data-stores/psql/notification-community-events.mts'

describe('community notification schema invariants', () => {
  afterAll(onGracefulShutdown)

  it('requires exactly one target and a bounded nonempty event key', async () => {
    const user = await createLocalTestUser()
    await expect(insertNotificationWithBothTargets(user.id)).rejects.toThrow(
      'chk_notifications__target',
    )
    await expect(insertNotificationWithEmptyEventKey(user.id)).rejects.toThrow(
      'chk_notifications__event_key',
    )
    await expect(insertNotificationWithOversizedEventKey(user.id)).rejects.toThrow(
      'chk_notifications__event_key',
    )
  })

  it('keeps event-key deduplication unconditional after dismissal', async () => {
    const user = await createLocalTestUser()
    const eventKey = `schema-digest:${user.id}`
    await insertDismissedDigestNotification(user.id, eventKey)
    await expect(insertDuplicateDigestNotification(user.id, eventKey)).rejects.toThrow(
      'duplicate key value violates unique constraint',
    )
  })

  it('rejects lifecycle and digest notifications with mismatched target shapes', async () => {
    const user = await createLocalTestUser()
    const communityId = await createNotificationCommunity(
      user.id,
      'Notification Shape Community',
      `shape-${user.id}`,
    )

    await expect(insertLifecycleNotificationWithIntent(user.id, communityId)).rejects.toThrow(
      'chk_notifications__community_event_shape',
    )
    await expect(insertLifecycleNotificationWithoutCommunity(user.id, communityId)).rejects.toThrow(
      'chk_notifications__community_event_shape',
    )
    await expect(
      insertLifecycleNotificationWithWrongCommunity(user.id, communityId),
    ).rejects.toThrow('chk_notifications__community_event_shape')
    await expect(insertDigestNotificationWithCommunity(user.id, communityId)).rejects.toThrow(
      'chk_notifications__community_event_shape',
    )
    await expect(insertDigestNotificationWithEntity(user.id, communityId)).rejects.toThrow(
      'chk_notifications__community_event_shape',
    )
  })

  it('defaults membership vacation suppression to false', async () => {
    const user = await createLocalTestUser()
    const communityId = await createNotificationCommunity(
      user.id,
      'Schema Test Community',
      `schema-${user.id}`,
    )
    expect(await insertCommunityMembershipAndGetVacationSuppression(communityId, user.id)).toBe(
      false,
    )
  })
})
