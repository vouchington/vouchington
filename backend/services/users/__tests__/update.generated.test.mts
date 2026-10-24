import { updateUserFields } from '../update-fields.mts'

import { createRandomString, createTestUser, safeUsername } from '@voucha/test-helpers'

import { getPrivateUserByAny } from '../get.mts'

import assert from 'node:assert'

import { it, expect, beforeAll, describe, onTestFinished, vi } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'

import { getUserIdByAnyCached } from '@services/entity-cache/lookups'

import { ValkeyBloomFilter } from '@data-stores/valkey'

import { entitiesListeners } from '@queues/entity-listeners/queues'

import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'

import { holdBackgroundDomain } from '../../../../test-helpers/shared-background-worker.mts'

describe('update.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('Update User should_receive_third_party_marketing to true', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { should_receive_third_party_marketing: true })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.should_receive_third_party_marketing, true)
  })

  it('Update User should_receive_third_party_marketing to false', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { should_receive_third_party_marketing: false })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.should_receive_third_party_marketing, false)
  })

  it('Update User should_receive_third_party_marketing rejects non-boolean value', async () => {
    const testUser = await createTestUser()
    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          should_receive_third_party_marketing: 'yes' as unknown as Parameters<
            typeof updateUserFields
          >[1]['should_receive_third_party_marketing'],
        }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })

  it('Update User country normalizes supported country codes', async () => {
    const testUser = await createTestUser()

    await updateUserFields(testUser.id, { country: 'us' })

    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.country, 'US')
  })

  it('Update User ui_locale normalizes supported UI locales', async () => {
    const testUser = await createTestUser()

    await updateUserFields(testUser.id, { ui_locale: 'EN_us' })

    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.ui_locale, 'en')
  })

  it('Update User ui_locale can be cleared', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { ui_locale: 'en' })

    await updateUserFields(testUser.id, { ui_locale: null })

    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.ui_locale, null)
  })

  it('Update User ui_locale normalizes newly supported UI locales', async () => {
    const testUser = await createTestUser()

    await updateUserFields(testUser.id, { ui_locale: 'FR' })

    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.ui_locale, 'fr')
  })

  it('Update User ui_locale rejects unsupported UI locale tags', async () => {
    const testUser = await createTestUser()

    await assert.rejects(
      () => updateUserFields(testUser.id, { ui_locale: 'de' }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })

  it('Update User ui_locale rejects non-string values', async () => {
    const testUser = await createTestUser()

    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          ui_locale: 123 as unknown as Parameters<typeof updateUserFields>[1]['ui_locale'],
        }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })

  it('Update User country rejects unsupported country codes', async () => {
    const testUser = await createTestUser()

    await assert.rejects(
      () => updateUserFields(testUser.id, { country: 'ZZ' }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })

  it('Update User', async () => {
    const username = safeUsername('test-user')
    await updateUserFields(user.id, { username, use_display_name_from: 'username' })
    const user2 = await getPrivateUserByAny(user.id)
    assert(user2)
    assert.strictEqual(user2!.id, user.id)
    assert.strictEqual(user2.username, username)
    const updatedUser = await getPrivateUserByAny(username)
    assert(updatedUser)
    assert.strictEqual(updatedUser.id, user.id)
    assert.strictEqual(updatedUser.username, username)
  })

  it('waits for username Bloom write and listener admission after commit', async () => {
    const random = createRandomString(10)
    const username = safeUsername('test-user')
    const normalizedUsername = username.toLowerCase()
    const originalUsersBloomFilter = entityCacheBloomFilters.users
    const originalConfig = originalUsersBloomFilter.getConfig()
    const testUsersBloomFilter = new ValkeyBloomFilter({
      name: `users-update-test-${random}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })

    entityCacheBloomFilters.users = testUsersBloomFilter
    const bloomEntered = Promise.withResolvers<void>()
    const releaseBloom = Promise.withResolvers<void>()
    const originalAddOrThrow = testUsersBloomFilter.addOrThrow
    const bloomSpy = vi.spyOn(testUsersBloomFilter, 'addOrThrow').mockImplementation(async keys => {
      if (keys.length !== 1 || keys[0] !== normalizedUsername) {
        return originalAddOrThrow.call(testUsersBloomFilter, keys)
      }
      bloomEntered.resolve()
      await releaseBloom.promise
      await originalAddOrThrow.call(testUsersBloomFilter, keys)
    })
    const queueGate = holdQueueAdmission(
      entitiesListeners,
      'entity-listeners.processUserUpdated',
      data => typeof data === 'object' && data !== null && 'id' in data && data.id === user.id,
    )
    const releaseWorker = holdBackgroundDomain('entity-listeners')
    let update: Promise<PrivateUser | undefined> | undefined
    let updateSettled = false
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        releaseBloom.resolve()
        queueGate.release()
        try {
          await update?.catch(() => undefined)
          await releaseWorker()
        } finally {
          queueGate.restore()
          bloomSpy.mockRestore()
          entityCacheBloomFilters.users = originalUsersBloomFilter
          await testUsersBloomFilter.delete().catch(() => {})
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)

    try {
      await testUsersBloomFilter.delete()
      await testUsersBloomFilter.ensureExists()

      update = updateUserFields(user.id, { username }).finally(() => {
        updateSettled = true
      })
      await Promise.all([bloomEntered.promise, queueGate.entered])

      expect((await getPrivateUserByAny(user.id))?.username).toBe(username)
      expect(updateSettled).toBe(false)

      queueGate.release()
      const admittedJob = await queueGate.admitted
      expect(admittedJob?.data).toEqual({ id: user.id })
      expect((await getPrivateUserByAny(user.id))?.username).toBe(username)
      expect(updateSettled).toBe(false)

      releaseBloom.resolve()
      await update
      expect(updateSettled).toBe(true)

      expect(await testUsersBloomFilter.exists(normalizedUsername)).toBe(true)
    } finally {
      await cleanup()
    }
  })

  it('Update User ignores empty use_display_name_from without username', async () => {
    await updateUserFields(user.id, {
      use_display_name_from: '' as unknown as 'username',
    })

    const user2 = await getPrivateUserByAny(user.id)
    assert(user2)
    assert.strictEqual(user2.id, user.id)
  })

  it('updateUserFields invalidates username lookup cache for old and new usernames', async () => {
    const targetUser = await createTestUser()
    assert(targetUser)
    assert(targetUser.username)

    const oldUsername = targetUser.username
    const newUsername = safeUsername('test-user')

    await getUserIdByAnyCached(oldUsername)
    await updateUserFields(targetUser.id, { username: newUsername })

    const oldLookup = await getUserIdByAnyCached(oldUsername)
    const newLookup = await getUserIdByAnyCached(newUsername)

    expect(oldLookup).toBeNull()
    expect(newLookup).toBe(targetUser.id)
  })
})
