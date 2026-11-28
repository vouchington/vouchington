import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { beginTransaction } from '../../../test-helpers/index.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import { createNotificationCommunity } from '../../../test-helpers/data-stores/psql/notification-community-events.mts'
import {
  insertCopyrightNotificationWithoutWorkItem,
  insertDigestWithStringCount,
  insertRoleChangeWithRoles,
} from '../../../test-helpers/data-stores/psql/notification-params-shape.mts'
import { insertTestMinimalCopyrightNotice } from '../../../test-helpers/notification-email-tombstone-fixtures.mts'

describe('notification params and copyright delivery CHECKs', () => {
  afterAll(onGracefulShutdown)

  it('restricts role-change params to community role slugs', async () => {
    const user = await createLocalTestUser()
    const communityId = await createNotificationCommunity(
      user.id,
      'Role Shape Community',
      `role-shape-${user.id}`,
    )
    await expect(
      insertRoleChangeWithRoles(user.id, communityId, { from: 'member', to: 'admin' }),
    ).rejects.toThrow('chk_notifications__params_shape')
    await insertRoleChangeWithRoles(user.id, communityId, { from: 'member', to: 'moderator' })
  })

  it('requires digest counts to be numbers', async () => {
    const user = await createLocalTestUser()
    await expect(insertDigestWithStringCount(user.id)).rejects.toThrow(
      'chk_notifications__params_shape',
    )
  })

  it('requires a delivery work item for every copyright kind', async () => {
    const user = await createLocalTestUser()
    await using query = await beginTransaction()
    const noticeId = await insertTestMinimalCopyrightNotice(query)
    await expect(
      insertCopyrightNotificationWithoutWorkItem(query, user.id, noticeId),
    ).rejects.toThrow('chk_notifications__copyright_delivery_shape')
  })
})
