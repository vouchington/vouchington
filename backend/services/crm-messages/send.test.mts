import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestCrmContact,
  linkTestCrmContactToUser,
  readAllQueueJobs,
  updateTestUserUiLocale,
} from '@voucha/test-helpers'
import { emails } from '@queues/emails/queues'
import { getCrmContact, optOutCrmContactByEmail } from '@services/crm-contacts'
import { createSesBounceEvent } from '@services/ses-bounce-events'
import { sendCrmEmail } from './send.mts'
import { getCrmMessagesByContactId } from './get.mts'
import type { PrivateUser } from '@services/users/types'

let admin: PrivateUser
let regularUser: PrivateUser

describe('send', () => {
  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('sendCrmEmail', () => {
    it('creates a message and a CRM conversation', async () => {
      const contact = await createTestCrmContact(admin)
      const message = await sendCrmEmail(admin, contact.id, {
        subject: 'Hello!',
        body_html: '<p>Hi there</p>',
        email_provider: 'ses',
      })
      expect(message.id).toBeTruthy()
      expect(message.conversation_id).toBeTruthy()
      expect(message.direction).toBe('outbound')
      expect(message.to_email).toBe(contact.email)
      expect(message.subject).toBe('Hello!')
      expect(message.__entity_type).toBe('crm_message')
      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; subject?: string; uiLocale?: string | null }
              variables?: { provider?: string }
            }
            return (
              job.name === 'processSendCrmEmail' &&
              data.input?.emailAddress === contact.email &&
              data.input?.subject === 'Hello!' &&
              data.input?.uiLocale === undefined &&
              data.variables?.provider === 'ses'
            )
          })
        })
        .toBe(true)
    })

    it('reuses the contact CRM conversation', async () => {
      const contact = await createTestCrmContact(admin)
      const first = await sendCrmEmail(admin, contact.id, {
        subject: 'Initial',
        body_text: 'Initial outreach.',
        email_provider: 'gmail_smtp',
      })
      const second = await sendCrmEmail(admin, contact.id, {
        subject: 'Follow up',
        body_text: 'Following up on our conversation.',
        email_provider: 'gmail_smtp',
      })
      expect(second.conversation_id).toBe(first.conversation_id)
    })

    it('includes linked user locale in queued CRM email jobs', async () => {
      const linkedUser = await createTestUser()
      const contact = await createTestCrmContact(admin)
      await updateTestUserUiLocale(linkedUser!.id, 'pt')
      await linkTestCrmContactToUser(contact.id, linkedUser!.id)

      await sendCrmEmail(admin, contact.id, {
        subject: 'Localized outreach',
        body_text: 'Hello',
        email_provider: 'ses',
      })

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; uiLocale?: string | null }
            }
            return (
              job.name === 'processSendCrmEmail' &&
              data.input?.emailAddress === contact.email &&
              data.input?.uiLocale === 'pt'
            )
          })
        })
        .toBe(true)
    })

    it('reuses the contact CRM conversation for concurrent sends', async () => {
      const contact = await createTestCrmContact(admin)
      const [first, second] = await Promise.all([
        sendCrmEmail(admin, contact.id, {
          subject: 'Initial',
          body_text: 'Initial outreach.',
          email_provider: 'gmail_smtp',
        }),
        sendCrmEmail(admin, contact.id, {
          subject: 'Follow up',
          body_text: 'Following up on our conversation.',
          email_provider: 'gmail_smtp',
        }),
      ])
      expect(second.conversation_id).toBe(first.conversation_id)
    })

    it('message appears in contact message history', async () => {
      const contact = await createTestCrmContact(admin)
      const message = await sendCrmEmail(admin, contact.id, {
        subject: 'History test',
        body_html: '<p>Test</p>',
        email_provider: 'ses',
      })
      const history = await getCrmMessagesByContactId(contact.id)
      expect(history.results.some(m => m.id === message.id)).toBe(true)
    })

    it('stores ai_prompt and ai_generated_at when provided', async () => {
      const contact = await createTestCrmContact(admin)
      const now = new Date()
      const message = await sendCrmEmail(admin, contact.id, {
        subject: 'AI Draft',
        body_html: '<p>AI generated</p>',
        email_provider: 'ses',
        ai_prompt: 'Write a friendly email',
        ai_generated_at: now,
      })
      expect(message.ai_prompt).toBe('Write a friendly email')
      expect(message.ai_generated_at).not.toBeNull()
    })

    it('records email_provider on the message', async () => {
      const contact = await createTestCrmContact(admin)
      const message = await sendCrmEmail(admin, contact.id, {
        subject: 'Provider test',
        body_text: 'Test',
        email_provider: 'gmail_smtp',
      })
      expect(message.email_provider).toBe('gmail_smtp')
    })

    it('throws 403 for non-admin', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        sendCrmEmail(regularUser, contact.id, {
          subject: 'Test',
          body_text: 'Test',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 404 for non-existent contact', async () => {
      await expect(
        sendCrmEmail(admin, '00000000-0000-0000-0000-000000000001', {
          subject: 'Test',
          body_text: 'Test',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when subject is missing', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        sendCrmEmail(admin, contact.id, {
          subject: '',
          body_html: '<p>Body</p>',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when subject is too long', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        sendCrmEmail(admin, contact.id, {
          subject: 'x'.repeat(999),
          body_html: '<p>Body</p>',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when the contact has opted out', async () => {
      const contact = await createTestCrmContact(admin)
      await optOutCrmContactByEmail(contact.email)
      await expect(
        sendCrmEmail(admin, contact.id, {
          subject: 'Test',
          body_text: 'Test',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when the contact email has a permanent bounce on file', async () => {
      const contact = await createTestCrmContact(admin)
      await createSesBounceEvent({
        notification_type: 'bounce',
        bounce_type: 'permanent',
        recipients: [contact.email],
        raw_message: { test: true },
      })

      await expect(
        sendCrmEmail(admin, contact.id, {
          subject: 'Test',
          body_text: 'Test',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)

      const history = await getCrmMessagesByContactId(contact.id)
      expect(history.results).toHaveLength(0)
      const unchanged = await getCrmContact(contact.id)
      expect(unchanged!.contacted_at).toBeNull()
    })

    it('throws 422 when the contact email has an SES complaint on file', async () => {
      const contact = await createTestCrmContact(admin)
      await createSesBounceEvent({
        notification_type: 'complaint',
        recipients: [contact.email],
        raw_message: { test: true },
      })

      await expect(
        sendCrmEmail(admin, contact.id, {
          subject: 'Test',
          body_text: 'Test',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)

      const history = await getCrmMessagesByContactId(contact.id)
      expect(history.results).toHaveLength(0)
      const unchanged = await getCrmContact(contact.id)
      expect(unchanged!.contacted_at).toBeNull()
    })

    it('throws 422 when both body_html and body_text are missing', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        sendCrmEmail(admin, contact.id, {
          subject: 'Test',
          email_provider: 'ses',
        }),
      ).rejects.toThrow(Error)
    })
  })
})
