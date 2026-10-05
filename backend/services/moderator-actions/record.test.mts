import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityRestriction,
  getModeratorActionRowsForTest,
  getTestModeratorActionRestrictionIds,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { Community } from '@voucha/types/entities/community'
import { recordModeratorAction, recordModeratorActions } from './record.mts'

describe('recordModeratorAction', () => {
  let actor: PrivateUser
  let community: Community

  beforeAll(async () => {
    actor = await createTestUser()
    community = await insertTestCommunity({ createdById: actor.id })
  })

  it('inserts a ban row with all fields', async () => {
    const target = await createTestUser()
    const suffix = randomBytes(4).toString('hex')
    const reason = `Test ban reason ${suffix}`

    await recordModeratorAction(actor.id, {
      actionType: 'ban',
      communityId: community.id,
      targetUserId: target.id,
      reason,
    })

    const rows = await getModeratorActionRowsForTest({
      actorId: actor.id,
      communityId: community.id,
      targetUserId: target.id,
    })

    expect(rows.length).toBeGreaterThanOrEqual(1)
    const row = rows[0]!
    expect(row.action_type).toBe('ban')
    expect(row.community_id).toBe(community.id)
    expect(row.actor_user_id).toBe(actor.id)
    expect(row.target_user_id).toBe(target.id)
    expect(row.reason).toBe(reason)
    expect(row.post_id).toBeNull()
    expect(row.report_id).toBeNull()
    expect(row.review_dispute_id).toBeNull()
    expect(row.community_application_id).toBeNull()
  })

  it('inserts a warn row with target_user_id and community_id', async () => {
    const target = await createTestUser()

    await recordModeratorAction(actor.id, {
      actionType: 'warn',
      communityId: community.id,
      targetUserId: target.id,
    })

    const rows = await getModeratorActionRowsForTest({
      actorId: actor.id,
      targetUserId: target.id,
    })

    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0]!.action_type).toBe('warn')
  })

  it('stores metadata correctly', async () => {
    const target = await createTestUser()
    const meta = { role: 'moderator', previous_role: 'member' }

    await recordModeratorAction(actor.id, {
      actionType: 'change_role',
      communityId: community.id,
      targetUserId: target.id,
      metadata: meta,
    })

    const rows = await getModeratorActionRowsForTest({
      actorId: actor.id,
      targetUserId: target.id,
    })

    const changeRoleRow = rows.find(r => r.action_type === 'change_role')
    expect(changeRoleRow).toBeDefined()
    expect(changeRoleRow!.metadata).toMatchObject(meta)
  })

  it('allows null actorId for system actions', async () => {
    const target = await createTestUser()

    await recordModeratorAction(null, {
      actionType: 'suspend',
      targetUserId: target.id,
    })

    const rows = await getModeratorActionRowsForTest({ targetUserId: target.id })
    const row = rows.find(r => r.action_type === 'suspend')
    expect(row).toBeDefined()
    expect(row!.actor_user_id).toBeNull()
  })

  it('stores each targeted restriction once as a child row, not in metadata', async () => {
    const restrictionCommunity = await insertTestCommunity({ createdById: actor.id })
    const noLinks = await insertTestCommunityRestriction({
      communityId: restrictionCommunity.id,
      restrictionType: 'no_links',
      activatedById: actor.id,
    })
    const approval = await insertTestCommunityRestriction({
      communityId: restrictionCommunity.id,
      restrictionType: 'require_post_approval',
      activatedById: actor.id,
    })

    await recordModeratorAction(actor.id, {
      actionType: 'activate_restriction',
      communityId: restrictionCommunity.id,
      communityRestrictionIds: [noLinks.id, approval.id, noLinks.id],
      metadata: { restriction_types: ['no_links', 'require_post_approval'] },
    })

    const [row] = await getModeratorActionRowsForTest({ communityId: restrictionCommunity.id })
    expect(await getTestModeratorActionRestrictionIds(row!.id)).toEqual(
      [noLinks.id, approval.id].toSorted(),
    )
    expect(row!.metadata).toEqual({ restriction_types: ['no_links', 'require_post_approval'] })
  })

  it('records an action without restrictions and no child rows', async () => {
    const plainCommunity = await insertTestCommunity({ createdById: actor.id })

    await recordModeratorAction(actor.id, {
      actionType: 'activate_restriction',
      communityId: plainCommunity.id,
    })

    const [row] = await getModeratorActionRowsForTest({ communityId: plainCommunity.id })
    expect(row).toBeDefined()
    expect(await getTestModeratorActionRestrictionIds(row!.id)).toEqual([])
  })

  it('rejects the whole action when a targeted restriction does not exist', async () => {
    const missingCommunity = await insertTestCommunity({ createdById: actor.id })

    await expect(
      recordModeratorAction(actor.id, {
        actionType: 'lift_restriction',
        communityId: missingCommunity.id,
        communityRestrictionIds: [randomUUID()],
      }),
    ).rejects.toMatchObject({ code: '23503' })

    expect(await getModeratorActionRowsForTest({ communityId: missingCommunity.id })).toEqual([])
  })

  it('records large action batches without exceeding PostgreSQL parameter limits', async () => {
    const batchActor = await createTestUser()
    const batchCommunity = await insertTestCommunity({ createdById: batchActor.id })
    const suffix = randomBytes(4).toString('hex')

    await recordModeratorActions(
      batchActor.id,
      Array.from({ length: 6000 }, (_, i) => ({
        actionType: 'dismiss_report',
        communityId: batchCommunity.id,
        reason: `bulk dismiss ${suffix} ${i}`,
      })),
    )

    const rows = await getModeratorActionRowsForTest({
      actorId: batchActor.id,
      communityId: batchCommunity.id,
    })
    expect(rows).toHaveLength(6000)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'dismiss_report',
          reason: `bulk dismiss ${suffix} 0`,
        }),
        expect.objectContaining({
          action_type: 'dismiss_report',
          reason: `bulk dismiss ${suffix} 5999`,
        }),
      ]),
    )
  })
})
