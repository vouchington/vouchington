import { createEmailAddressLoginToken, createPhoneNumberLoginToken } from '../authentication.mts'

import { updateUserFields } from '../update-fields.mts'

import { updateUserEmailAddress, updateUserPhoneNumber } from '../update-contact-info.mts'

import {
  createRandomEmailAddress,
  createRandomPhoneNumber,
  createRandomString,
  createTestUser,
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

  describe('updateUserPhoneNumber uniqueness', () => {
    let user1: PrivateUser
    let user2: PrivateUser

    beforeAll(async () => {
      user1 = await createTestUser()
      user2 = await createTestUser()
    })
    it('rejects a phone number already used by another user', async () => {
      const phone = createRandomPhoneNumber()
      const token = await createPhoneNumberLoginToken(phone)
      await updateUserPhoneNumber(user1.id, phone, token.token)
      const token2 = await createPhoneNumberLoginToken(phone)
      await expect(updateUserPhoneNumber(user2.id, phone, token2.token)).rejects.toMatchObject({
        status: 422,
        message: 'Phone number is already in use',
      })
    })

    it('requires a phone verification token', async () => {
      const phone = createRandomPhoneNumber()

      await expect(
        updateUserPhoneNumber(
          user1.id,
          phone,
          null as unknown as Parameters<typeof updateUserPhoneNumber>[2],
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: 'Phone verification token is required',
      })
      await expect(updateUserPhoneNumber(user1.id, phone, '   ')).rejects.toMatchObject({
        status: 422,
        message: 'Phone verification token is required',
      })

      await expect(getPrivateUserByAny(verifyPhoneNumber(phone))).resolves.toBeNull()
    })

    it('allows re-promotion of own secondary phone number', async () => {
      const phone1 = createRandomPhoneNumber()
      const token1 = await createPhoneNumberLoginToken(phone1)
      await updateUserPhoneNumber(user1.id, phone1, token1.token)

      // Assign a new primary, making phone1 secondary
      const phone2 = createRandomPhoneNumber()
      const token2 = await createPhoneNumberLoginToken(phone2)
      await updateUserPhoneNumber(user1.id, phone2, token2.token)

      // Re-promote phone1 — should succeed
      const token3 = await createPhoneNumberLoginToken(phone1)
      await updateUserPhoneNumber(user1.id, phone1, token3.token)
      const updated = await getPrivateUserByAny(verifyPhoneNumber(phone1))
      assert(updated)
      expect(updated.id).toBe(user1.id)
    })
  })

  describe('updateUserEmailAddress uniqueness', () => {
    let user1: PrivateUser
    let user2: PrivateUser

    beforeAll(async () => {
      user1 = await createTestUser()
      user2 = await createTestUser()
    })
    it('rejects an email address already used by another user', async () => {
      const email = createRandomEmailAddress()
      const token = await createEmailAddressLoginToken(email)
      await updateUserEmailAddress(user1.id, email, token.token)
      const token2 = await createEmailAddressLoginToken(email)
      await expect(updateUserEmailAddress(user2.id, email, token2.token)).rejects.toMatchObject({
        status: 422,
        message: 'Email address is already in use',
      })
    })

    it('requires an email verification token', async () => {
      const email = createRandomEmailAddress()

      await expect(
        updateUserEmailAddress(
          user1.id,
          email,
          null as unknown as Parameters<typeof updateUserEmailAddress>[2],
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: 'Email verification token is required',
      })
      await expect(updateUserEmailAddress(user1.id, email, '   ')).rejects.toMatchObject({
        status: 422,
        message: 'Email verification token is required',
      })

      await expect(getPrivateUserByAny(email)).resolves.toBeNull()
    })

    it('allows re-promotion of own secondary email address with verification token', async () => {
      const email1 = createRandomEmailAddress()
      const token1 = await createEmailAddressLoginToken(email1)
      await updateUserEmailAddress(user1.id, email1, token1.token)

      // Assign a new primary, making email1 secondary
      const email2 = createRandomEmailAddress()
      const token2 = await createEmailAddressLoginToken(email2)
      await updateUserEmailAddress(user1.id, email2, token2.token)

      // Re-promote email1 — should succeed
      const token3 = await createEmailAddressLoginToken(email1)
      await updateUserEmailAddress(user1.id, email1, token3.token)
      const updated = await getPrivateUserByAny(email1)
      assert(updated)
      expect(updated.id).toBe(user1.id)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof updateUserFields)
  void (0 as unknown as typeof createRandomString)
  void (0 as unknown as typeof entityCacheBloomFilters)
  void (0 as unknown as typeof getUserIdByAnyCached)
  void (0 as unknown as typeof ValkeyBloomFilter)
  void (0 as unknown as typeof user)
})
