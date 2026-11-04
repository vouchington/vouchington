import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUserDirect,
  getTestUserRaw,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteUserAt,
  suspendTestUser,
} from '@voucha/test-helpers'
import { getTestPurgeCommunity } from '@voucha/test-helpers/user-purge-communities'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig } from '@services/data-retention/config'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

describe('final user purge continuation', () => {
  it('carries the actual moderator cursor through sensitive continuations until the purge settles', async () => {
    const owner = await createTestUserDirect()
    const moderator = await createTestUserDirect()
    const outside = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await suspendTestUser(moderator.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(owner.id, window.firstEligibleDate)
    await softDeleteUserAt(outside.id, window.firstEligibleDate)
    const outsideBefore = await getTestUserRaw(outside.id)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      community_moderator_scan_page_size: 1,
    })
    onTestFinished(restore)

    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const idAt = (step: number) => `data-retention-cleanup__${runId}__${step}`
    onTestFinished(async () => {
      await Promise.all([1, 2, 3].map(async step => (await psql.getJob(idAt(step)))?.remove()))
    })
    const options = {
      retention: {
        families: ['softDeletedUsers'] as const,
        softDeletedUsers: {
          userIds: [owner.id],
          batchSize: 10,
          maxBatches: 1,
          now: window.now,
          retentionDays: window.retentionDays,
          lowerBoundDate: window.lowerBoundDate,
        },
      },
    }
    const initial = await processPsql('dataRetentionCleanup', {}, undefined, initialJobId, options)
    expect(initial).toMatchObject({ softDeletedUsers: { deleted: 0, hasMore: true } })
    const first = await psql.getJob(idAt(1))
    const userPurge = {
      userId: owner.id,
      communityId: community.id,
      afterModeratorId: membership.id,
    }
    expect(first?.data).toMatchObject({ continuation: { runId, step: 1, userPurge } })
    expect(first?.opts).toMatchObject({ sensitive: true })
    expect(await getTestUserRaw(owner.id)).not.toBeNull()
    expect(await getTestUserRaw(outside.id)).not.toBeNull()

    const secondResult = await processPsql(
      'dataRetentionCleanup',
      first!.data as PsqlRetentionJobData,
      undefined,
      first!.id,
      options,
    )
    expect(secondResult).toMatchObject({ softDeletedUsers: { deleted: 0, hasMore: true } })
    const second = await psql.getJob(idAt(2))
    expect(second?.data).toMatchObject({ continuation: { runId, step: 2 } })
    const finalResult = await processPsql(
      'dataRetentionCleanup',
      second!.data as PsqlRetentionJobData,
      undefined,
      second!.id,
      options,
    )
    expect(finalResult).toMatchObject({ softDeletedUsers: { deleted: 1, hasMore: false } })
    expect(await psql.getJob(idAt(3))).toBeNull()
    expect(await getTestUserRaw(owner.id)).toBeNull()
    expect(await getTestUserRaw(outside.id)).toEqual(outsideBefore)
    expect(await getTestPurgeCommunity(community.id)).toMatchObject({
      archived_at: expect.any(Date),
    })
  })
})
