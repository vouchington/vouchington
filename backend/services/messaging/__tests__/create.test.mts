import { randomUUID } from 'node:crypto'
import { describe, it, expect, onTestFinished, vi } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  findOrCreateDirectConversation,
  createGroupConversation,
  createConversationMessage,
} from '../create.mts'
import { getConversationMessages, getConversationParticipants } from '../get.mts'

describe('findOrCreateDirectConversation', () => {
  it('creates a new direct_message conversation between two users', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(conversation.channel_type).toBe('direct_message')
    expect(conversation.id).toBeTruthy()

    const participants = await getConversationParticipants(conversation.id)
    expect(participants).toHaveLength(2)
    const userIds = participants.map(p => p.user_id).toSorted()
    expect(userIds).toEqual([sender.id, recipient.id].toSorted())
  })

  it('returns existing conversation on second call (idempotent)', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()

    const first = await findOrCreateDirectConversation(sender.id, recipient.id)
    const second = await findOrCreateDirectConversation(sender.id, recipient.id)

    expect(first.id).toBe(second.id)
  })

  it('returns existing conversation when called with reversed roles', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()

    const first = await findOrCreateDirectConversation(userA.id, userB.id)
    const second = await findOrCreateDirectConversation(userB.id, userA.id)

    expect(first.id).toBe(second.id)
  })
})

describe('createGroupConversation', () => {
  it('creates a direct_message conversation with N+1 participants', async () => {
    const owner = await createTestUser()
    const recipient1 = await createTestUser()
    const recipient2 = await createTestUser()

    const conversation = await createGroupConversation(owner.id, [recipient1.id, recipient2.id])

    expect(conversation.channel_type).toBe('direct_message')

    const participants = await getConversationParticipants(conversation.id)
    expect(participants).toHaveLength(3)

    const ownerParticipant = participants.find(p => p.user_id === owner.id)
    expect(ownerParticipant?.role).toBe('owner')

    const memberIds = participants
      .reduce<(string | null)[]>((acc, p) => {
        if (p.role === 'member') acc.push(p.user_id)
        return acc
      }, [])
      .toSorted()
    expect(memberIds).toEqual([recipient1.id, recipient2.id].toSorted())
  })
})

describe('createConversationMessage', () => {
  it('returns after the committed message job is admitted', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)
    const body = `Hello ${randomUUID()}`
    const jobName = ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB.name
    const gate = holdQueueAdmission(
      entitiesListeners,
      jobName,
      data =>
        typeof data === 'object' &&
        data !== null &&
        'conversationId' in data &&
        data.conversationId === conversation.id &&
        'senderId' in data &&
        data.senderId === sender.id,
    )
    let operation: ReturnType<typeof createConversationMessage> | undefined
    let entered = false
    let settled = false
    void gate.entered.then(() => {
      entered = true
    })
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        gate.release()
        try {
          await operation?.catch(() => undefined)
          if (entered) await removeEnqueuedJobs([gate.admitted.catch(() => null)], jobName)
        } finally {
          gate.restore()
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)

    operation = createConversationMessage(sender.id, WEB_PROVENANCE, conversation.id, body).finally(
      () => {
        settled = true
      },
    )

    try {
      expect(
        await Promise.race([
          gate.entered.then(() => 'admission-entered'),
          operation.then(
            () => 'creation-settled',
            () => 'creation-rejected',
          ),
        ]),
      ).toBe('admission-entered')
      const persisted = await getConversationMessages(conversation.id)
      expect(persisted).toEqual([
        expect.objectContaining({
          body_text: body,
          conversation_id: conversation.id,
          created_by_id: sender.id,
        }),
      ])
      expect(settled).toBe(false)

      gate.release()
      const admitted = await gate.admitted
      const message = await operation
      expect(message.id).toBe(persisted[0]?.id)
      expect(message).toMatchObject({
        conversation_id: conversation.id,
        body_text: body,
        created_by_id: sender.id,
      })
      expect(await readEnqueuedJob(entitiesListeners, admitted)).toMatchObject({
        name: jobName,
        data: { conversationId: conversation.id, messageId: message.id, senderId: sender.id },
      })
    } finally {
      await cleanup()
    }
  })

  it('keeps the committed message when admission fails and reports once', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)
    const body = `Admission failure ${randomUUID()}`
    const admissionError = new Error('Injected conversation-message queue admission failure')
    const originalAdd = entitiesListeners.add
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    let matchingAdmissions = 0
    const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      if (
        name === ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB.name &&
        typeof data === 'object' &&
        data !== null &&
        'conversationId' in data &&
        data.conversationId === conversation.id &&
        'senderId' in data &&
        data.senderId === sender.id
      ) {
        matchingAdmissions += 1
        return Promise.reject(admissionError)
      }
      return originalAdd.call(entitiesListeners, name, data, options)
    })
    try {
      const message = await createConversationMessage(
        sender.id,
        WEB_PROVENANCE,
        conversation.id,
        body,
      )
      expect(message).toMatchObject({
        conversation_id: conversation.id,
        body_text: body,
        created_by_id: sender.id,
      })
      expect(await getConversationMessages(conversation.id)).toEqual([
        expect.objectContaining({ id: message.id, body_text: body }),
      ])
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reportedError]) => reportedError === admissionError),
      ).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })
})
