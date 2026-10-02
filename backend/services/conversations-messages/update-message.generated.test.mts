import { describe, expect, it } from 'vitest'
import { createSystemUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
  getConversationMessagesByConversationId,
  updateConversationMessageContent,
} from './index.mts'
import type { ConversationMessageContent } from './types.mts'

describe('updateConversationMessageContent', () => {
  it('updates message content to assistant response', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Update Test')
    const message = await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'assistant',
      content: null,
    })
    const content: ConversationMessageContent = {
      role: 'assistant',
      content: 'Here is the response.',
    }
    await updateConversationMessageContent(conversation.id, message.id, content)

    const messages = await getConversationMessagesByConversationId(conversation.id)
    const updated = messages.find(m => m.id === message.id)
    expect(updated).toBeDefined()
    expect(updated?.content).toEqual(content)
  })

  it('updates message content with error payload', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Error Payload Test')
    const message = await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'assistant',
      content: null,
    })
    const content: ConversationMessageContent = {
      role: 'assistant',
      content: null,
      error: 'Something went wrong',
    }
    await updateConversationMessageContent(conversation.id, message.id, content)

    const messages = await getConversationMessagesByConversationId(conversation.id)
    const updated = messages.find(m => m.id === message.id)
    expect(updated).toBeDefined()
    expect(updated?.content).toEqual(content)
  })

  it('only updates the specified message', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Multiple Messages')
    const message1 = await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'user',
      content: 'First',
    })
    const message2 = await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'assistant',
      content: null,
    })
    await updateConversationMessageContent(conversation.id, message2.id, {
      role: 'assistant',
      content: 'Updated second only',
    })

    const messages = await getConversationMessagesByConversationId(conversation.id)
    const first = messages.find(m => m.id === message1.id)
    const second = messages.find(m => m.id === message2.id)
    expect(first?.content).toEqual({ role: 'user', content: 'First' })
    expect(second?.content).toEqual({ role: 'assistant', content: 'Updated second only' })
  })

  it('moves a pending assistant turn through error and completion', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Pending transitions')
    await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'user',
      content: 'First',
    })
    const pending = await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'assistant',
      content: null,
    })

    await updateConversationMessageContent(conversation.id, pending.id, {
      role: 'assistant',
      content: null,
      error: 'provider failed',
    })
    await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'user',
      content: 'Retry',
    })
    const retry = await createConversationMessage(conversation.id, user.id, WEB_PROVENANCE, {
      role: 'assistant',
      content: null,
    })
    await updateConversationMessageContent(conversation.id, retry.id, {
      role: 'assistant',
      content: 'Completed',
    })

    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages.map(message => message.content)).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: null, error: 'provider failed' },
      { role: 'user', content: 'Retry' },
      { role: 'assistant', content: 'Completed' },
    ])
  })
})
