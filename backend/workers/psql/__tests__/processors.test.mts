import { randomBytes } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import type { cleanupPartitions as cleanupPartitionsService } from '@data-stores/psql/migration-runner/monthly-partitions'

const cleanupPartitions = vi.fn<typeof cleanupPartitionsService>()
const createPartitions = vi.fn<() => Promise<void>>()
const runConfigDriven = vi.fn<() => Promise<void>>()
const runMigrations = vi.fn<() => Promise<void>>()
const runViews = vi.fn<() => Promise<void>>()
import processPsql from '../processors.mts'

describe('processPsql', () => {
  it.each([
    ['runMigrations', runMigrations],
    ['runViews', runViews],
    ['runConfigDriven', runConfigDriven],
    ['createPartitions', createPartitions],
    ['cleanupPartitions', cleanupPartitions],
  ] as const)('calls %s when selected', async (jobName, processor) => {
    processor.mockReset()
    if (jobName === 'cleanupPartitions')
      cleanupPartitions.mockResolvedValue({ outcomes: [], hasMore: false })

    await processPsql(jobName, undefined, {
      cleanupPartitions,
      createPartitions,
      runConfigDriven,
      runMigrations,
      runViews,
    })

    expect(processor).toHaveBeenCalledOnce()
  })

  it('runs the selected retention family against owned rows', async () => {
    const expiresAt = new Date('2000-01-01T00:00:00Z')
    const ownedId = await insertTestOAuthAuthorization({ expiresAt })
    const outsideId = await insertTestOAuthAuthorization({ expiresAt })
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ authorizationIds: [ownedId, outsideId] }),
    )
    const outsideBefore = await getTestOAuthAuthorization(outsideId)

    const result = await processPsql('dataRetentionCleanup', undefined, undefined, undefined, {
      retention: {
        families: ['expiredOAuthAuthorizations'],
        expiredOAuthAuthorizations: {
          authorizationIds: [ownedId],
          batchSize: 2,
          maxBatches: 1,
        },
      },
    })

    expect(result).toMatchObject({ expiredOAuthAuthorizations: { deleted: 1, hasMore: false } })
    expect(await getTestOAuthAuthorization(ownedId)).toBeNull()
    expect(await getTestOAuthAuthorization(outsideId)).toEqual(outsideBefore)
  })

  it('reconciles post vote drift against real posts', async () => {
    const creator = await createTestUser()
    await insertTestPost({
      title: 'Processor vote drift',
      slug: `processor-vote-drift-${randomBytes(6).toString('hex')}`,
      createdById: creator.id,
      markdown: 'test',
    })

    const result = await processPsql('reconcileVoteDrift')

    expect(result).toMatchObject({ entityTable: 'posts' })
    expect((result as { sampled: number }).sampled).toBeGreaterThanOrEqual(1)
  })
})
