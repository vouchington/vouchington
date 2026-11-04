import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dataRetentionConfig } from '@services/data-retention/config'
import processPsql from '../processors.mts'

describe('processPsql retention limits', () => {
  it('passes the configured batch and per-run limits to its selected cleanup family', async () => {
    const now = Date.now()
    const ownedIds = await Promise.all(
      [180_000, 120_000, 60_000].map(age =>
        insertTestOAuthAuthorization({ expiresAt: new Date(now - age) }),
      ),
    )
    const unownedId = await insertTestOAuthAuthorization({
      expiresAt: new Date(now - 240_000),
    })
    const authorizationIds = [...ownedIds, unownedId]
    onTestFinished(async () => deleteTestOAuthAuthorizationFixtures({ authorizationIds }))
    const unownedBefore = await getTestOAuthAuthorization(unownedId)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      max_batches_per_run: 2,
    })
    onTestFinished(restore)
    const options = {
      families: ['expiredOAuthAuthorizations'] as const,
      expiredOAuthAuthorizations: { authorizationIds: ownedIds },
    }

    await expect(
      processPsql('dataRetentionCleanup', undefined, undefined, undefined, { retention: options }),
    ).resolves.toMatchObject({
      expiredOAuthAuthorizations: { deleted: 2, hasMore: true },
    })
    expect(await getTestOAuthAuthorization(ownedIds[0]!)).toBeNull()
    expect(await getTestOAuthAuthorization(ownedIds[1]!)).toBeNull()
    expect(await getTestOAuthAuthorization(ownedIds[2]!)).not.toBeNull()
    expect(await getTestOAuthAuthorization(unownedId)).toEqual(unownedBefore)

    await expect(
      processPsql('dataRetentionCleanup', undefined, undefined, undefined, { retention: options }),
    ).resolves.toMatchObject({
      expiredOAuthAuthorizations: { deleted: 1, hasMore: false },
    })
    expect(await getTestOAuthAuthorization(ownedIds[2]!)).toBeNull()
    expect(await getTestOAuthAuthorization(unownedId)).toEqual(unownedBefore)
  })

  it('waits for stored retention limits to load on a cold start', async () => {
    await dataRetentionConfig.waitForInitialization()
    const restoreFields = deleteDynamicConfigFieldsForTest(
      dataRetentionConfig,
      Object.keys(dataRetentionConfig.fieldTypes),
    )
    onTestFinished(() => {
      restoreFields()
      vi.restoreAllMocks()
    })
    const now = Date.now()
    const authorizationIds = await Promise.all(
      [120_000, 60_000].map(age =>
        insertTestOAuthAuthorization({ expiresAt: new Date(now - age) }),
      ),
    )
    const [firstAuthorizationId, secondAuthorizationId] = authorizationIds
    const unownedId = await insertTestOAuthAuthorization({
      expiresAt: new Date(now - 180_000),
    })
    onTestFinished(async () =>
      deleteTestOAuthAuthorizationFixtures({ authorizationIds: [...authorizationIds, unownedId] }),
    )
    const unownedBefore = await getTestOAuthAuthorization(unownedId)
    const initialized = Promise.withResolvers<void>()
    vi.spyOn(dataRetentionConfig, 'waitForInitialization').mockReturnValue(initialized.promise)

    const processing = processPsql('dataRetentionCleanup', undefined, undefined, undefined, {
      retention: {
        families: ['expiredOAuthAuthorizations'],
        expiredOAuthAuthorizations: { authorizationIds },
      },
    })
    try {
      expect(await getTestOAuthAuthorization(firstAuthorizationId!)).not.toBeNull()
      expect(await getTestOAuthAuthorization(secondAuthorizationId!)).not.toBeNull()
      expect(await getTestOAuthAuthorization(unownedId)).toEqual(unownedBefore)
      overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      })
      initialized.resolve()
      await expect(processing).resolves.toMatchObject({
        expiredOAuthAuthorizations: { deleted: 1, hasMore: true },
      })
      expect(await getTestOAuthAuthorization(firstAuthorizationId!)).toBeNull()
      expect(await getTestOAuthAuthorization(secondAuthorizationId!)).not.toBeNull()
      expect(await getTestOAuthAuthorization(unownedId)).toEqual(unownedBefore)
      await expect(
        processPsql('dataRetentionCleanup', undefined, undefined, undefined, {
          retention: {
            families: ['expiredOAuthAuthorizations'],
            expiredOAuthAuthorizations: { authorizationIds },
          },
        }),
      ).resolves.toMatchObject({
        expiredOAuthAuthorizations: { deleted: 1, hasMore: true },
      })
      expect(await getTestOAuthAuthorization(secondAuthorizationId!)).toBeNull()
      expect(await getTestOAuthAuthorization(unownedId)).toEqual(unownedBefore)
    } finally {
      initialized.resolve()
      await processing
    }
  })
})
