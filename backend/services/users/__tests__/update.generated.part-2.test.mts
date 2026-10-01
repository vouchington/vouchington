import assert from 'node:assert'
import { beforeAll, describe, expect, it } from 'vitest'
import { createEmailAddressLoginToken, createPhoneNumberLoginToken } from '../authentication.mts'
import { updateUserEmailAddress, updateUserPhoneNumber } from '../update-contact-info.mts'
import { getPrivateUserByAny } from '../get.mts'
import {
  createRandomEmailAddress,
  createRandomPhoneNumber,
  createTestUser,
} from '@voucha/test-helpers'
import { verifyPhoneNumber } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'

const contactCases = [
  {
    kind: 'PhoneNumber',
    createContact: createRandomPhoneNumber,
    createToken: createPhoneNumberLoginToken,
    updateContact: updateUserPhoneNumber,
    normalizeContact: verifyPhoneNumber,
    conflictMessage: 'Phone number is already in use',
    tokenMessage: 'Phone verification token is required',
  },
  {
    kind: 'EmailAddress',
    createContact: createRandomEmailAddress,
    createToken: createEmailAddressLoginToken,
    updateContact: updateUserEmailAddress,
    normalizeContact: (email: string) => email,
    conflictMessage: 'Email address is already in use',
    tokenMessage: 'Email verification token is required',
  },
]

describe('update.generated', () => {
  describe.each(contactCases)(
    'updateUser$kind uniqueness',
    ({
      createContact,
      createToken,
      updateContact,
      normalizeContact,
      conflictMessage,
      tokenMessage,
    }) => {
      let user1: PrivateUser
      let user2: PrivateUser

      beforeAll(async () => {
        user1 = await createTestUser()
        user2 = await createTestUser()
      })

      it('rejects a contact already used by another user', async () => {
        const contact = createContact()
        const token = await createToken(contact)
        await updateContact(user1.id, contact, token.token)
        const token2 = await createToken(contact)
        await expect(updateContact(user2.id, contact, token2.token)).rejects.toMatchObject({
          status: 422,
          message: conflictMessage,
        })
      })

      it('requires a verification token', async () => {
        const contact = createContact()
        await expect(
          updateContact(user1.id, contact, null as unknown as Parameters<typeof updateContact>[2]),
        ).rejects.toMatchObject({ status: 422, message: tokenMessage })
        await expect(updateContact(user1.id, contact, '   ')).rejects.toMatchObject({
          status: 422,
          message: tokenMessage,
        })
        await expect(getPrivateUserByAny(normalizeContact(contact))).resolves.toBeNull()
      })

      it('allows re-promotion of an owned secondary contact with a verification token', async () => {
        const contact1 = createContact()
        const token1 = await createToken(contact1)
        await updateContact(user1.id, contact1, token1.token)
        const contact2 = createContact()
        const token2 = await createToken(contact2)
        await updateContact(user1.id, contact2, token2.token)
        const token3 = await createToken(contact1)
        await updateContact(user1.id, contact1, token3.token)
        const updated = await getPrivateUserByAny(normalizeContact(contact1))
        assert(updated)
        expect(updated.id).toBe(user1.id)
      })
    },
  )
})
