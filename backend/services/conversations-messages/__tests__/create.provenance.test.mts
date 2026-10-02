/**
 * Chat messages record the channel of the request that wrote them, and no read path returns that
 * channel.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, readTestContentProvenance } from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import {
  createClientGeneratedChatTurn,
  createConversation,
  createConversationMessage,
  getClientGeneratedChatTurnReplay,
  getConversationMessagesByConversationId,
} from '../index.mts'

describe('conversation message provenance', () => {
  let oauthClientId: string

  beforeAll(async () => {
    oauthClientId = await insertContentProvenanceOAuthClient()
  })

  async function newConversation() {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Provenance')
    return { user, conversation }
  }

  function turn(userId: string, conversationId: string, provenance: ContentProvenance) {
    return {
      conversationId,
      userMessageId: randomUUID(),
      assistantMessageId: randomUUID(),
      createdById: userId,
      provenance,
      message: 'Summarize my rewards profile',
      assistantContent: 'Use transferable points first.',
      modelProvider: 'apple_foundation' as const,
      modelName: 'apple-foundation-system',
    }
  }

  it.each([
    ['a web session', () => ({ createdVia: 'web', oauthClientId: null }) as const],
    ['a native session', () => ({ createdVia: 'swift', oauthClientId: null }) as const],
    ['an API key', () => ({ createdVia: 'api', oauthClientId: null }) as const],
    ['an OAuth client over MCP', () => ({ createdVia: 'mcp', oauthClientId }) as const],
    ['the platform', () => ({ createdVia: 'system', oauthClientId: null }) as const],
  ])('records the channel of %s on a chat message', async (_label, build) => {
    const provenance: ContentProvenance = build()
    const { user, conversation } = await newConversation()

    const message = await createConversationMessage(conversation.id, user.id, provenance, {
      role: 'user',
      content: 'Hello',
    })

    await expect(readTestContentProvenance('conversation_messages', message.id)).resolves.toEqual(
      provenance,
    )
  })

  it('records the request channel on both messages of a client-generated turn', async () => {
    const provenance: ContentProvenance = { createdVia: 'mcp', oauthClientId }
    const { user, conversation } = await newConversation()
    const params = turn(user.id, conversation.id, provenance)

    const { userMessage, assistantMessage } = await createClientGeneratedChatTurn(params)

    expect(userMessage.id).toBe(params.userMessageId)
    expect(assistantMessage.id).toBe(params.assistantMessageId)
    for (const message of [userMessage, assistantMessage]) {
      await expect(readTestContentProvenance('conversation_messages', message.id)).resolves.toEqual(
        provenance,
      )
    }
  })

  it('replays a turn without rewriting the channel that stored it', async () => {
    const { user, conversation } = await newConversation()
    const stored: ContentProvenance = { createdVia: 'swift', oauthClientId: null }
    const params = turn(user.id, conversation.id, stored)
    const first = await createClientGeneratedChatTurn(params)

    const retry = { ...params, provenance: { createdVia: 'mcp', oauthClientId } as const }
    const replay = await createClientGeneratedChatTurn(retry)
    const replayRead = await getClientGeneratedChatTurnReplay(retry)

    expect(replay.userMessage.id).toBe(first.userMessage.id)
    expect(replayRead?.assistantMessage.id).toBe(first.assistantMessage.id)
    for (const message of [first.userMessage, first.assistantMessage]) {
      await expect(readTestContentProvenance('conversation_messages', message.id)).resolves.toEqual(
        stored,
      )
    }
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toHaveLength(2)
  })

  it('keeps provenance out of created, replayed and listed messages', async () => {
    const { user, conversation } = await newConversation()
    const params = turn(user.id, conversation.id, { createdVia: 'api', oauthClientId })
    const chat = await createConversationMessage(conversation.id, user.id, params.provenance, {
      role: 'user',
      content: 'Hello',
    })
    const created = await createClientGeneratedChatTurn(params)
    const replay = await createClientGeneratedChatTurn(params)
    const replayRead = await getClientGeneratedChatTurnReplay(params)
    const listed = await getConversationMessagesByConversationId(conversation.id)

    expect(listed).toHaveLength(3)
    expect(JSON.stringify({ chat, created, replay, replayRead, listed })).not.toMatch(
      /created_via|oauth/,
    )
  })

  it('rejects an OAuth client on a channel that cannot name one', async () => {
    const { user, conversation } = await newConversation()
    const invalid = { createdVia: 'web', oauthClientId } as unknown as ContentProvenance

    await expect(
      createConversationMessage(conversation.id, user.id, invalid, {
        role: 'user',
        content: 'Hello',
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createClientGeneratedChatTurn(turn(user.id, conversation.id, invalid)),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toEqual([])
  })
})
