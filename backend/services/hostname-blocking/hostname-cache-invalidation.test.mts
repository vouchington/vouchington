import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import {
  failNextHostnameCacheDeleteForTest,
  getHostnameCacheInvalidationWorkForTest,
  makeHostnameCacheInvalidationAvailableForTest,
} from '@voucha/test-helpers/hostname-cache-invalidation'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { entityCacheWorkConfig } from '@services/entity-cache/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getUrlHostnameByAnyCached } from '../entity-fetch/get.mts'
import { blockHostname, blockHostnameInTransaction } from './block-hostname.mts'
import { unblockHostname } from './unblock-hostname.mts'

describe('staff hostname policy cache invalidation', () => {
  it('drains cached subdomains after a committed parent block', async () => {
    const moderator = await createTestUser({ administrator: true })
    const parent = `staff-parent-block-${crypto.randomUUID()}.example.com`
    const parentId = await insertTestUrlHostname({ hostname: parent })
    const childId = await insertTestUrlHostname({ hostname: `child.${parent}` })
    expect((await getUrlHostnameByAnyCached(parentId))?.is_blocked).toBe(false)
    expect((await getUrlHostnameByAnyCached(childId))?.is_blocked).toBe(false)

    await blockHostname(moderator.id, parentId, { penalizeCreators: false })

    expect((await getUrlHostnameByAnyCached(parentId))?.is_blocked).toBe(true)
    expect((await getUrlHostnameByAnyCached(childId))?.is_blocked).toBe(true)
    expect(await getHostnameCacheInvalidationWorkForTest(childId)).toBeNull()
  })

  it('retains committed block and unblock work after inline cache failure', async () => {
    const moderator = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `staff-cache-failure-${crypto.randomUUID()}.example.com`,
    })
    const olderHostnameId = await insertTestUrlHostname({
      hostname: `staff-cache-backlog-${crypto.randomUUID()}.example.com`,
    })
    await using backlogTransaction = await beginTransaction()
    await enqueueHostnameCacheInvalidation(backlogTransaction, [olderHostnameId])
    await backlogTransaction.commit()
    await entityCacheWorkConfig.waitForInitialization()
    const restoreLimit = overrideDynamicConfigFieldsForTest(entityCacheWorkConfig, {
      delete_keys_per_batch: 1,
    })
    try {
      for (const operation of [blockHostname, unblockHostname]) {
        const restoreFailure = failNextHostnameCacheDeleteForTest(hostnameId)
        try {
          if (operation === blockHostname)
            await blockHostname(moderator.id, hostnameId, { penalizeCreators: false })
          else await unblockHostname(moderator.id, hostnameId)
        } finally {
          restoreFailure()
        }
        expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).toMatchObject({
          attempt_count: 1,
          lease_token: null,
        })
        await makeHostnameCacheInvalidationAvailableForTest(hostnameId)
        expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] })).toBe(1)
      }
    } finally {
      restoreLimit()
    }
  })

  it('keeps a precommit policy read stale until the committed invalidation drains', async () => {
    const moderator = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `staff-cache-commit-${crypto.randomUUID()}.example.com`,
    })
    expect((await getUrlHostnameByAnyCached(hostnameId))?.is_blocked).toBe(false)

    await using transaction = await beginTransaction()
    await blockHostnameInTransaction(moderator.id, hostnameId, transaction, {
      penalizeCreators: false,
    })
    expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).toBeNull()
    expect((await getUrlHostnameByAnyCached(hostnameId))?.is_blocked).toBe(false)
    await transaction.commit()

    expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).not.toBeNull()
    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] })).toBe(1)
    expect((await getUrlHostnameByAnyCached(hostnameId))?.is_blocked).toBe(true)
  })
})
