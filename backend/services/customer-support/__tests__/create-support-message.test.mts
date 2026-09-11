import { describe, it, expect, beforeAll } from 'vitest'

import { createTestUser } from '@voucha/test-helpers'

import { insertTestSupportContact } from '@voucha/test-helpers/entities/support-contacts'

import {
  countSupportInboundEmailReceiptRows,
  countSupportInboundEmailMessageIdRegistryRows,
  countSupportMessagesByEmailMessageId,
  countSupportThreadsBySubject,
  getTestSupportMessageLifecycleChanges,
} from '@voucha/test-helpers/entities/support-messages'

import { insertTestSupportThread } from '@voucha/test-helpers/entities/support-threads'

import type { PrivateUser } from '@services/users/types'

import { createInboundSupportEmailMessage } from '../create-inbound-support-message.mts'

import { createSupportMessage } from '../create-support-message.mts'
import { getSupportMessageEmbeddingJobsFor } from '../queue-test-helpers.mts'

import { createSupportDraftMessage } from '../create-support-draft-message.mts'

import { getSupportThreadIdByEmailMessageId } from '../get-support-message-by-id.mts'

import { updateSupportDraftMessage } from '../update-support-draft-message.mts'

import { approveSupportMessage } from '../approve-support-message.mts'

import { sendApprovedSupportMessage } from '../send-approved-support-message.mts'

import { getSupportMessagesByThreadId } from '../get-support-messages-by-thread-id.mts'

describe('create-support-message', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let user: PrivateUser

  let threadId: string

  beforeAll(async () => {
    user = await createTestUser()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+messages-test-${rand()}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    threadId = thread.id
  })

  describe('createSupportMessage', () => {
    it('creates an inbound message', async () => {
      const message = await createSupportMessage(threadId, {
        direction: 'inbound',
        bodyText: 'Hello, I need help.',
      })
      expect(message.id).toBeDefined()
      expect(message.direction).toBe('inbound')
      expect(message.body_text).toBe('Hello, I need help.')
      expect(message.drafted_at).toBeNull()
      expect(message.sent_at).toBeNull()

      await expect
        .poll(async () => (await getSupportMessageEmbeddingJobsFor(threadId, message.id)).length)
        .toBe(1)
    })

    it('rejects messages without text or HTML content', async () => {
      await expect(
        createSupportMessage(threadId, {
          direction: 'inbound',
          bodyText: '   ',
          bodyHtml: '',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('creates an outbound message with email metadata', async () => {
      const emailMsgId = `msg-${rand()}@mail.example.com`
      const message = await createSupportMessage(threadId, {
        direction: 'outbound',
        bodyText: 'Thanks for reaching out.',
        emailMessageId: emailMsgId,
        emailSubject: 'Re: Your inquiry',
        emailFrom: 'tests+support@voucha.ai',
        emailTo: 'tests+customer@voucha.ai',
        createdById: user.id,
      })
      expect(message.direction).toBe('outbound')
      expect(message.email_message_id).toBe(emailMsgId)
      expect(message.email_subject).toBe('Re: Your inquiry')
      expect(message.created_by_id).toBe(user.id)
    })

    it('allows duplicate outbound email Message-ID metadata', async () => {
      const emailMsgId = `<outbound-duplicate-${rand()}@mail.example.com>`
      const first = await createSupportMessage(threadId, {
        direction: 'outbound',
        bodyText: 'First outbound reply.',
        emailMessageId: emailMsgId,
      })
      const second = await createSupportMessage(threadId, {
        direction: 'outbound',
        bodyText: 'Second outbound reply.',
        emailMessageId: emailMsgId,
      })

      expect(first.id).not.toBe(second.id)
      expect(first.email_message_id).toBe(emailMsgId)
      expect(second.email_message_id).toBe(emailMsgId)
    })

    it('finds outbound email Message-ID metadata for reply threading', async () => {
      const emailMsgId = `<outbound-threading-${rand()}@mail.example.com>`
      await createSupportMessage(threadId, {
        direction: 'outbound',
        bodyText: 'Outbound reply with provider metadata.',
        emailMessageId: emailMsgId,
      })

      await expect(getSupportThreadIdByEmailMessageId(emailMsgId)).resolves.toBe(threadId)
    })

    it('finds duplicate outbound email Message-ID metadata deterministically', async () => {
      const emailMsgId = `<outbound-deterministic-${rand()}@mail.example.com>`
      const contact = await insertTestSupportContact({
        emailAddress: `tests+outbound-deterministic-${rand()}@voucha.ai`,
      })
      const newerThread = await insertTestSupportThread({ supportContactId: contact.id })

      await createSupportMessage(threadId, {
        direction: 'outbound',
        bodyText: 'Older outbound provider metadata.',
        emailMessageId: emailMsgId,
      })
      await createSupportMessage(newerThread.id, {
        direction: 'outbound',
        bodyText: 'Newer outbound provider metadata.',
        emailMessageId: emailMsgId,
      })

      await expect(getSupportThreadIdByEmailMessageId(emailMsgId)).resolves.toBe(newerThread.id)
    })
  })

  describe('createInboundSupportEmailMessage', () => {
    it('deduplicates deliveries by SES message ID when the email has no Message-ID header', async () => {
      const suffix = rand()
      const sesMessageId = `ses-no-rfc-${suffix}`
      const s3ObjectKey = `incoming/${sesMessageId}`

      const first = await createInboundSupportEmailMessage({
        sesMessageId,
        s3ObjectKey,
        fromEmail: `tests+ses-no-rfc-${suffix}@voucha.ai`,
        subject: `SES without RFC ID ${suffix}`,
        bodyText: 'First delivery.',
        emailTo: 'support@voucha.ai',
      })
      const second = await createInboundSupportEmailMessage({
        sesMessageId,
        s3ObjectKey,
        fromEmail: `tests+ses-no-rfc-duplicate-${suffix}@voucha.ai`,
        subject: `Duplicate SES without RFC ID ${suffix}`,
        bodyText: 'Duplicate delivery.',
        emailTo: 'support@voucha.ai',
      })

      expect(first.is_new).toBe(true)
      expect(second.is_new).toBe(false)
      await expect(countSupportInboundEmailReceiptRows(sesMessageId)).resolves.toBe(1)
      await expect(countSupportThreadsBySubject(`SES without RFC ID ${suffix}`)).resolves.toBe(1)
      await expect(
        countSupportThreadsBySubject(`Duplicate SES without RFC ID ${suffix}`),
      ).resolves.toBe(0)
    })

    it('deduplicates inbound Message-ID values globally across support threads', async () => {
      const suffix = rand()
      const emailMessageId = `<inbound-dedup-${suffix}@mail.example.com>`

      const first = await createInboundSupportEmailMessage({
        sesMessageId: `ses-inbound-dedup-a-${suffix}`,
        s3ObjectKey: `incoming/ses-inbound-dedup-a-${suffix}`,
        fromEmail: `tests+inbound-dedup-a-${suffix}@voucha.ai`,
        fromName: `Inbound A ${suffix}`,
        subject: `Inbound first ${suffix}`,
        bodyText: 'First inbound message.',
        emailMessageId,
        emailTo: 'support@voucha.ai',
      })
      const second = await createInboundSupportEmailMessage({
        sesMessageId: `ses-inbound-dedup-b-${suffix}`,
        s3ObjectKey: `incoming/ses-inbound-dedup-b-${suffix}`,
        fromEmail: `tests+inbound-dedup-b-${suffix}@voucha.ai`,
        fromName: `Inbound B ${suffix}`,
        subject: `Inbound second ${suffix}`,
        bodyText: 'Second inbound message.',
        emailMessageId,
        emailTo: 'support@voucha.ai',
      })

      expect(first.is_new).toBe(true)
      expect(second.is_new).toBe(false)
      if (!first.is_new) throw new Error('Expected first inbound message to be created')

      await expect
        .poll(
          async () =>
            (await getSupportMessageEmbeddingJobsFor(first.threadId, first.message.id)).length,
        )
        .toBe(1)
      await expect(countSupportMessagesByEmailMessageId(emailMessageId)).resolves.toBe(1)
      await expect(countSupportInboundEmailMessageIdRegistryRows(emailMessageId)).resolves.toBe(1)
      await expect(countSupportThreadsBySubject(`Inbound second ${suffix}`)).resolves.toBe(0)
    })

    it('deduplicates concurrent inbound Message-ID reservations', async () => {
      const suffix = rand()
      const emailMessageId = `<inbound-race-${suffix}@mail.example.com>`

      const results = await Promise.all([
        createInboundSupportEmailMessage({
          sesMessageId: `ses-inbound-race-a-${suffix}`,
          s3ObjectKey: `incoming/ses-inbound-race-a-${suffix}`,
          fromEmail: `tests+inbound-race-a-${suffix}@voucha.ai`,
          subject: `Inbound race A ${suffix}`,
          bodyText: 'Race inbound A.',
          emailMessageId,
          emailTo: 'support@voucha.ai',
        }),
        createInboundSupportEmailMessage({
          sesMessageId: `ses-inbound-race-b-${suffix}`,
          s3ObjectKey: `incoming/ses-inbound-race-b-${suffix}`,
          fromEmail: `tests+inbound-race-b-${suffix}@voucha.ai`,
          subject: `Inbound race B ${suffix}`,
          bodyText: 'Race inbound B.',
          emailMessageId,
          emailTo: 'support@voucha.ai',
        }),
      ])

      expect(results.filter(result => result.is_new)).toHaveLength(1)
      expect(results.filter(result => !result.is_new)).toHaveLength(1)

      await expect(countSupportMessagesByEmailMessageId(emailMessageId)).resolves.toBe(1)
    })

    it('threads replies using the first matching reply reference', async () => {
      const suffix = rand()
      const outboundMessageId = `<outbound-reference-${suffix}@mail.example.com>`
      await createSupportMessage(threadId, {
        direction: 'outbound',
        bodyText: 'Outbound message to reference.',
        emailMessageId: outboundMessageId,
      })

      const inbound = await createInboundSupportEmailMessage({
        sesMessageId: `ses-inbound-reference-${suffix}`,
        s3ObjectKey: `incoming/ses-inbound-reference-${suffix}`,
        fromEmail: `tests+references-${suffix}@voucha.ai`,
        subject: `References reply ${suffix}`,
        bodyText: 'Inbound reply with multiple references.',
        emailMessageId: `<inbound-reference-${suffix}@mail.example.com>`,
        replyRefs: [`<missing-reference-${suffix}@mail.example.com>`, outboundMessageId],
        emailTo: 'support@voucha.ai',
      })

      expect(inbound.is_new).toBe(true)
      if (!inbound.is_new) throw new Error('Expected inbound message to be created')
      expect(inbound.threadId).toBe(threadId)
      expect(inbound.message.support_thread_id).toBe(threadId)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getTestSupportMessageLifecycleChanges)
  void (0 as unknown as typeof createSupportDraftMessage)
  void (0 as unknown as typeof updateSupportDraftMessage)
  void (0 as unknown as typeof approveSupportMessage)
  void (0 as unknown as typeof sendApprovedSupportMessage)
  void (0 as unknown as typeof getSupportMessagesByThreadId)
})
