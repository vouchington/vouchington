import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, createTestCrmContact, createUniqueTestEmail } from '@voucha/test-helpers'
import { encryptSecret } from '@modules/token-secrets'
import {
  createCrmUnsubscribeToken,
  createCrmUnsubscribeUrl,
  createCrmListUnsubscribeHeaders,
  unsubscribeCrmContactByToken,
} from './unsubscribe.mts'
import { getCrmContact } from './get.mts'
import type { PrivateUser } from '@services/users/types'

describe('unsubscribe', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('unsubscribeCrmContactByToken', () => {
    it('opts the contact out for a valid token', async () => {
      const email = createUniqueTestEmail('crm-unsubscribe-token')
      const contact = await createTestCrmContact(admin, { email })
      const token = createCrmUnsubscribeToken(email)

      await unsubscribeCrmContactByToken(token)

      const updated = await getCrmContact(contact.id)
      expect(updated!.opted_out_at).not.toBeNull()
    })

    it('throws 400 for a missing token', async () => {
      await expect(unsubscribeCrmContactByToken('')).rejects.toThrow(Error)
    })

    it('throws 400 for a garbage token', async () => {
      await expect(unsubscribeCrmContactByToken('not-a-real-token')).rejects.toThrow(Error)
    })

    it('throws 400 for a token encrypted under a different purpose', async () => {
      const tampered = encryptSecret(
        JSON.stringify({ email: createUniqueTestEmail('crm-unsubscribe-tampered') }),
        'a-different-purpose',
      )
      await expect(unsubscribeCrmContactByToken(tampered)).rejects.toThrow(Error)
    })

    it('does not throw when the token references an unknown email', async () => {
      const token = createCrmUnsubscribeToken(createUniqueTestEmail('crm-unsubscribe-unknown'))
      await expect(unsubscribeCrmContactByToken(token)).resolves.toBeUndefined()
    })
  })

  describe('createCrmUnsubscribeUrl', () => {
    it('embeds an encoded token on the web landing page path', () => {
      const email = createUniqueTestEmail('crm-unsubscribe-url')
      const url = createCrmUnsubscribeUrl(email)
      expect(url).toContain('/crm/unsubscribe?token=')
    })
  })

  describe('createCrmListUnsubscribeHeaders', () => {
    it('points List-Unsubscribe at the public API endpoint', () => {
      const email = createUniqueTestEmail('crm-unsubscribe-headers')
      const headers = createCrmListUnsubscribeHeaders(email)
      expect(headers['List-Unsubscribe']).toContain('/api/v1/crm/unsubscribe?token=')
      expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    })
  })
})
