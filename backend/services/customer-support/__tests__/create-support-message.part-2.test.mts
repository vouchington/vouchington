import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createTestUser, readAllQueueJobs, updateTestUserUiLocale } from '@voucha/test-helpers'
import { emails } from '@queues/emails/queues'

import { insertTestSupportContact } from '@voucha/test-helpers/entities/support-contacts'

import {
  countSupportInboundEmailMessageIdRegistryRows,
  countSupportMessagesByEmailMessageId,
  countSupportThreadsBySubject,
  getTestSupportMessageLifecycleChanges,
} from '@voucha/test-helpers/entities/support-messages'

import { insertTestSupportThread } from '@voucha/test-helpers/entities/support-threads'

import type { PrivateUser } from '@services/users/types'

import { createInboundSupportEmailMessage } from '../create-inbound-support-message.mts'
import { createSupportDraftMessage } from '../create-support-draft-message.mts'
import { getSupportThreadIdByEmailMessageId } from '../get-support-message-by-id.mts'
import { updateSupportDraftMessage } from '../update-support-draft-message.mts'
import { approveSupportMessage } from '../approve-support-message.mts'
import { sendApprovedSupportMessage } from '../send-approved-support-message.mts'
import { getSupportMessagesByThreadId } from '../get-support-messages-by-thread-id.mts'
import { resolveSupportThread } from '../threads.mts'

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

  describe('createSupportDraftMessage', () => {
    it('creates a draft message with drafted_at set', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'This is a draft response.',
      })
      expect(draft.id).toBeDefined()
      expect(draft.direction).toBe('outbound')
      expect(draft.drafted_at).not.toBeNull()
      expect(draft.sent_at).toBeNull()
      expect(draft.approved_at).toBeNull()
      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes).toHaveLength(1)
      expect(changes[0].change_type).toBe('create_draft')
      expect(changes[0].drafted_at?.getTime()).toBe(draft.drafted_at?.getTime())
    })

    it('records agent run metadata for generated drafts', async () => {
      const agentRunId = crypto.randomUUID()
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Generated draft response.',
        agentRunId,
      })

      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes).toHaveLength(1)
      expect(changes[0].metadata).toEqual({ agentRunId })
    })

    it('rejects empty drafts', async () => {
      await expect(
        createSupportDraftMessage(threadId, {
          bodyText: '',
          bodyHtml: '   ',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })
  })

  describe('updateSupportDraftMessage', () => {
    it('sets edited_at on update', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Original draft text.',
      })
      const updated = await updateSupportDraftMessage(threadId, draft.id, {
        bodyText: 'Updated draft text.',
        editedById: user.id,
      })
      expect(updated).not.toBeNull()
      expect(updated!.body_text).toBe('Updated draft text.')
      expect(updated!.edited_at).not.toBeNull()
      expect(updated!.edited_by_id).toBe(user.id)
      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes.map(change => change.change_type)).toEqual(['create_draft', 'edit_draft'])
      expect(changes[1].changed_by_id).toBe(user.id)
      expect(changes[1].edited_at?.getTime()).toBe(updated!.edited_at?.getTime())
    })

    it('allows clearing draft text when HTML content remains', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Original draft text.',
        bodyHtml: '<p>Original draft HTML.</p>',
      })

      const updated = await updateSupportDraftMessage(threadId, draft.id, {
        bodyText: ' ',
        editedById: user.id,
      })

      expect(updated).not.toBeNull()
      expect(updated!.body_text).toBe(' ')
      expect(updated!.body_html).toBe('<p>Original draft HTML.</p>')
    })

    it('rejects edits without text or HTML content', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Original draft text.',
      })

      await expect(
        updateSupportDraftMessage(threadId, draft.id, {
          bodyText: ' ',
          bodyHtml: '',
          editedById: user.id,
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('does not edit an approved draft or record an edit lifecycle change', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Approved draft text.',
      })
      await approveSupportMessage(threadId, draft.id, user.id)

      const updated = await updateSupportDraftMessage(threadId, draft.id, {
        bodyText: 'Attempted revision.',
        editedById: user.id,
      })

      expect(updated).toBeNull()
      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes.map(change => change.change_type)).toEqual(['create_draft', 'approve'])
    })

    it('rejects edits to drafts on resolved threads', async () => {
      const contact = await insertTestSupportContact({
        emailAddress: `tests+resolved-draft-edit-${rand()}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const draft = await createSupportDraftMessage(thread.id, { bodyText: 'Resolved draft.' })
      await resolveSupportThread(thread.id, user.id)

      await expect(
        updateSupportDraftMessage(thread.id, draft.id, {
          bodyText: 'Forbidden edit.',
          editedById: user.id,
        }),
      ).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('approveSupportMessage', () => {
    it('sets approved_at and approved_by_id', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Draft to approve.',
      })
      await approveSupportMessage(threadId, draft.id, user.id)
      const { results } = await getSupportMessagesByThreadId(threadId)
      const found = results.find(m => m.id === draft.id)
      expect(found!.approved_at).not.toBeNull()
      expect(found!.approved_by_id).toBe(user.id)
      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes.map(change => change.change_type)).toEqual(['create_draft', 'approve'])
      expect(changes[1].changed_by_id).toBe(user.id)
      expect(changes[1].approved_at?.getTime()).toBe(found!.approved_at?.getTime())
    })

    it('rejects a repeated approval without recording another lifecycle change', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Draft approved only once.',
      })
      await approveSupportMessage(threadId, draft.id, user.id)

      await expect(approveSupportMessage(threadId, draft.id, user.id)).rejects.toMatchObject({
        status: 422,
      })

      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes.map(change => change.change_type)).toEqual(['create_draft', 'approve'])
    })

    it('rejects approval of a draft on a resolved thread', async () => {
      const contact = await insertTestSupportContact({
        emailAddress: `tests+resolved-draft-approval-${rand()}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const draft = await createSupportDraftMessage(thread.id, { bodyText: 'Resolved draft.' })
      await resolveSupportThread(thread.id, user.id)

      await expect(approveSupportMessage(thread.id, draft.id, user.id)).rejects.toMatchObject({
        status: 409,
      })
    })
  })

  describe('sendApprovedSupportMessage', () => {
    it('sets sent_at after approval', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Draft to send.',
      })
      await approveSupportMessage(threadId, draft.id, user.id)
      await sendApprovedSupportMessage(threadId, draft.id, user.id)
      const { results } = await getSupportMessagesByThreadId(threadId)
      const found = results.find(m => m.id === draft.id)
      expect(found!.sent_at).not.toBeNull()
      const changes = await getTestSupportMessageLifecycleChanges(threadId, draft.id)
      expect(changes.map(change => change.change_type)).toEqual(['create_draft', 'approve', 'send'])
      expect(changes[2].changed_by_id).toBe(user.id)
      expect(changes[2].sent_at?.getTime()).toBe(found!.sent_at?.getTime())
    })

    it('enqueues support replies with the linked user locale', async () => {
      const linkedUser = await createTestUser()
      await updateTestUserUiLocale(linkedUser.id, 'fr')
      const localEmailAddress = `tests+support-locale-${rand()}@voucha.ai`
      const localContact = await insertTestSupportContact({
        emailAddress: localEmailAddress,
        userId: linkedUser.id,
      })
      const localThread = await insertTestSupportThread({ supportContactId: localContact.id })
      const draft = await createSupportDraftMessage(localThread.id, {
        bodyText: 'Localized support reply.',
      })
      await approveSupportMessage(localThread.id, draft.id, user.id)

      await sendApprovedSupportMessage(localThread.id, draft.id, user.id)

      const waiting = await readAllQueueJobs(emails)
      const job = waiting.find(
        queued =>
          (queued.data as { input?: { emailAddress?: string } }).input?.emailAddress ===
          localEmailAddress,
      )
      expect(job).toBeDefined()
      expect(job!.data).toMatchObject({
        input: { emailAddress: localEmailAddress, uiLocale: 'fr' },
        variables: { bodyText: 'Localized support reply.' },
      })
    })

    it('throws 422 when not approved', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Draft not approved.',
      })
      await expect(sendApprovedSupportMessage(threadId, draft.id, user.id)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('throws 422 when already sent', async () => {
      const draft = await createSupportDraftMessage(threadId, {
        bodyText: 'Already sent draft.',
      })
      await approveSupportMessage(threadId, draft.id, user.id)
      await sendApprovedSupportMessage(threadId, draft.id, user.id)
      await expect(sendApprovedSupportMessage(threadId, draft.id, user.id)).rejects.toMatchObject({
        status: 422,
      })
    })
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof countSupportInboundEmailMessageIdRegistryRows)
  void (0 as unknown as typeof countSupportMessagesByEmailMessageId)
  void (0 as unknown as typeof countSupportThreadsBySubject)
  void (0 as unknown as typeof createInboundSupportEmailMessage)
  void (0 as unknown as typeof getSupportThreadIdByEmailMessageId)
})
