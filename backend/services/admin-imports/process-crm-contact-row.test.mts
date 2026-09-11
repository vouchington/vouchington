import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createImportBatch } from './create-batch.mts'
import { processCrmContactRow } from './process-crm-contact-row.mts'
import {
  getCrmContact,
  getCrmContactByEmail,
  getCrmContactSocialAccounts,
  optOutCrmContactByEmail,
  archiveCrmContact,
} from '@services/crm-contacts'
import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from './types.mts'

type NullableCrmImportField = 'phone' | 'vertical' | 'follower_count' | 'notes'

describe('process-crm-contact-row', () => {
  const r = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  async function makeRow(
    creator: PrivateUser,
    inputData: Record<string, string>,
  ): Promise<ImportRow> {
    const { rows } = await createImportBatch(creator, 'crm_contact', [
      inputData as Record<string, unknown>,
    ])
    return rows[0]
  }

  describe('processCrmContactRow', () => {
    it('creates a new contact and returns its ID', async () => {
      const suffix = r()
      const row = await makeRow(admin, {
        name: `New Contact ${suffix}`,
        email: `tests+new-contact-${suffix}@voucha.ai`,
      })

      const contactId = await processCrmContactRow(admin, row)

      expect(contactId).toBeTruthy()
      const contact = await getCrmContact(contactId)
      expect(contact).not.toBeNull()
      expect(contact!.email).toBe(`tests+new-contact-${suffix}@voucha.ai`)
      expect(contact!.name).toBe(`New Contact ${suffix}`)
      expect(contact!.source).toBe('csv_import')
    })

    it('creates a contact with all fields', async () => {
      const suffix = r()
      const row = await makeRow(admin, {
        name: `Full Contact ${suffix}`,
        email: `tests+full-${suffix}@voucha.ai`,
        phone: '+1234567890',
        vertical: 'travel',
        follower_count: '15000',
        instagram: `@ig_${suffix}`,
        tiktok: `@tt_${suffix}`,
        notes: 'Test notes',
      })

      const contactId = await processCrmContactRow(admin, row)

      const contact = await getCrmContact(contactId)
      expect(contact!.vertical).toBe('travel')
      expect(contact!.follower_count).toBe(15000)
      expect(contact!.notes).toBe('Test notes')

      const accounts = await getCrmContactSocialAccounts(contactId)
      expect(accounts.some(a => a.platform === 'instagram')).toBe(true)
      expect(accounts.some(a => a.platform === 'tiktok')).toBe(true)
    })

    it('updates existing contact on re-import by email', async () => {
      const suffix = r()
      const email = `tests+update-contact-${suffix}@voucha.ai`

      // First import
      const row1 = await makeRow(admin, {
        name: `Original Name ${suffix}`,
        email,
      })
      const contactId = await processCrmContactRow(admin, row1)
      const original = await getCrmContact(contactId)
      expect(original!.name).toBe(`Original Name ${suffix}`)

      // Second import with updated name
      const row2 = await makeRow(admin, {
        name: `Updated Name ${suffix}`,
        email,
      })
      const updatedId = await processCrmContactRow(admin, row2)
      expect(updatedId).toBe(contactId)

      const updated = await getCrmContact(contactId)
      expect(updated!.name).toBe(`Updated Name ${suffix}`)
    })

    describe('nullable present-column update semantics', () => {
      const cases: Array<{
        field: NullableCrmImportField
        initial: string
        updated: string
        expectedInitial: string | number
        expectedUpdated: string | number
      }> = [
        {
          field: 'phone',
          initial: '+15555550001',
          updated: '+15555550002',
          expectedInitial: '+15555550001',
          expectedUpdated: '+15555550002',
        },
        {
          field: 'vertical',
          initial: 'travel',
          updated: 'ai',
          expectedInitial: 'travel',
          expectedUpdated: 'ai',
        },
        {
          field: 'follower_count',
          initial: '2500',
          updated: '10000',
          expectedInitial: 2500,
          expectedUpdated: 10000,
        },
        {
          field: 'notes',
          initial: 'Stale notes',
          updated: 'Fresh notes',
          expectedInitial: 'Stale notes',
          expectedUpdated: 'Fresh notes',
        },
      ]

      it.each(cases)('preserves $field when re-import omits the column', async testCase => {
        const suffix = r()
        const email = `tests+preserve-${testCase.field}-${suffix}@voucha.ai`
        const contactId = await createContactWithField(email, testCase.field, testCase.initial)

        const row = await makeRow(admin, {
          name: `Preserve ${testCase.field} ${suffix}`,
          email,
        })
        await processCrmContactRow(admin, row)

        const contact = await getCrmContact(contactId)
        expect(contact![testCase.field]).toBe(testCase.expectedInitial)
      })

      it.each(cases)('clears $field when re-import includes a blank cell', async testCase => {
        const suffix = r()
        const email = `tests+clear-${testCase.field}-${suffix}@voucha.ai`
        const contactId = await createContactWithField(email, testCase.field, testCase.initial)

        const row = await makeRow(admin, {
          name: `Clear ${testCase.field} ${suffix}`,
          email,
          [testCase.field]: '',
        })
        await processCrmContactRow(admin, row)

        const contact = await getCrmContact(contactId)
        expect(contact![testCase.field]).toBeNull()
      })

      it.each(cases)('updates $field when re-import includes a nonblank cell', async testCase => {
        const suffix = r()
        const email = `tests+update-${testCase.field}-${suffix}@voucha.ai`
        const contactId = await createContactWithField(email, testCase.field, testCase.initial)

        const row = await makeRow(admin, {
          name: `Update ${testCase.field} ${suffix}`,
          email,
          [testCase.field]: testCase.updated,
        })
        await processCrmContactRow(admin, row)

        const contact = await getCrmContact(contactId)
        expect(contact![testCase.field]).toBe(testCase.expectedUpdated)
      })
    })

    it('is idempotent — same row processed twice produces same result', async () => {
      const suffix = r()
      const row = await makeRow(admin, {
        name: `Idempotent ${suffix}`,
        email: `tests+idempotent-${suffix}@voucha.ai`,
      })

      const id1 = await processCrmContactRow(admin, row)
      const id2 = await processCrmContactRow(admin, row)

      expect(id1).toBe(id2)
    })

    it('normalizes email to lowercase', async () => {
      const suffix = r()
      const row = await makeRow(admin, {
        name: `Email Case ${suffix}`,
        email: `tests+EMAIL-CASE-${suffix}@voucha.ai`,
      })

      const contactId = await processCrmContactRow(admin, row)
      const contact = await getCrmContact(contactId)
      expect(contact!.email).toBe(`tests+email-case-${suffix}@voucha.ai`)
    })

    it('carries opt-out forward when a re-import creates a fresh row for an archived, opted-out contact', async () => {
      const suffix = r()
      const email = `tests+opted-out-archived-${suffix}@voucha.ai`

      const row1 = await makeRow(admin, { name: `Opted Out ${suffix}`, email })
      const contactId = await processCrmContactRow(admin, row1)

      await optOutCrmContactByEmail(email)
      await archiveCrmContact(admin, contactId)

      // Archived rows are excluded from getCrmContactByEmail, so this re-import
      // creates a brand-new row rather than updating the archived one.
      const row2 = await makeRow(admin, { name: `Opted Out ${suffix} Reimported`, email })
      const newContactId = await processCrmContactRow(admin, row2)

      expect(newContactId).not.toBe(contactId)
      const newContact = await getCrmContact(newContactId)
      expect(newContact!.opted_out_at).not.toBeNull()
    })

    it('looks up existing contact case-insensitively', async () => {
      const suffix = r()
      const email = `tests+case-lookup-${suffix}@voucha.ai`

      // Create contact with lowercase email
      const row1 = await makeRow(admin, { name: `Case Lookup ${suffix}`, email })
      const id1 = await processCrmContactRow(admin, row1)

      // Re-import with uppercase email — should match existing
      const row2 = await makeRow(admin, {
        name: `Case Lookup Updated ${suffix}`,
        email: email.toUpperCase(),
      })
      const id2 = await processCrmContactRow(admin, row2)

      expect(id1).toBe(id2)
      const contact = await getCrmContactByEmail(email)
      expect(contact!.name).toBe(`Case Lookup Updated ${suffix}`)
    })
  })

  async function createContactWithField(
    email: string,
    field: NullableCrmImportField,
    value: string,
  ): Promise<string> {
    const row = await makeRow(admin, {
      name: `Field Semantics ${r()}`,
      email,
      [field]: value,
    })
    return processCrmContactRow(admin, row)
  }
})
