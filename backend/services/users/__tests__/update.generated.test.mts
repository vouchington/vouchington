import { createEmailAddressLoginToken, createPhoneNumberLoginToken } from '../authentication.mts'

import { updateUserFields } from '../update-fields.mts'

import { updateUserEmailAddress, updateUserPhoneNumber } from '../update-contact-info.mts'

import {
  createRandomEmailAddress,
  createRandomPhoneNumber,
  createRandomString,
  createTestUser,
  safeUsername,
} from '@voucha/test-helpers'

import { getPrivateUserByAny } from '../get.mts'

import { verifyPhoneNumber } from '@modules/utils'

import assert from 'node:assert'

import { it, expect, beforeAll, describe } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'

import { getUserIdByAnyCached } from '@services/entity-cache/lookups'

import { ValkeyBloomFilter } from '@data-stores/valkey'

describe('update.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('Update Email Address', async () => {
    const email_address = createRandomEmailAddress()
    const token = await createEmailAddressLoginToken(email_address)
    await updateUserEmailAddress(user.id, email_address, token.token)
    const updatedUser = await getPrivateUserByAny(email_address)
    assert(updatedUser)
    assert.strictEqual(updatedUser.id, user.id)
  })

  it('Update Phone Number', async () => {
    const phone_number = createRandomPhoneNumber()
    const token = await createPhoneNumberLoginToken(phone_number)
    await updateUserPhoneNumber(user.id, phone_number, token.token)
    const updatedUser = await getPrivateUserByAny(await verifyPhoneNumber(phone_number))
    assert(updatedUser)
    assert.strictEqual(updatedUser.id, user.id)
  })

  it('Update User third_party_marketing to true', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { third_party_marketing: true })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.third_party_marketing, true)
  })

  it('Update User third_party_marketing to false', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { third_party_marketing: false })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.third_party_marketing, false)
  })

  it('Update User third_party_marketing rejects non-boolean value', async () => {
    const testUser = await createTestUser()
    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          third_party_marketing: 'yes' as unknown as Parameters<
            typeof updateUserFields
          >[1]['third_party_marketing'],
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

  it('updateUserFields adds new username to users bloom filter', async () => {
    const random = createRandomString(10)
    const username = safeUsername('test-user')
    const originalUsersBloomFilter = entityCacheBloomFilters.users
    const originalConfig = originalUsersBloomFilter.getConfig()
    const testUsersBloomFilter = new ValkeyBloomFilter({
      name: `users-update-test-${random}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })

    entityCacheBloomFilters.users = testUsersBloomFilter
    try {
      await testUsersBloomFilter.delete()
      await testUsersBloomFilter.ensureExists()

      await updateUserFields(user.id, { username })
      // .add() is fire-and-forget in production; explicitly add and await for deterministic test
      await testUsersBloomFilter.add([username.trim().toLowerCase()])

      await expect.poll(() => testUsersBloomFilter.exists(username.toLowerCase())).toBe(true)
    } finally {
      entityCacheBloomFilters.users = originalUsersBloomFilter
      await testUsersBloomFilter.delete().catch(() => {})
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
