/**
 * A direct or modmail message records the channel of the request that sent it, and no read path
 * returns that channel.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, readTestContentProvenance } from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createConversationMessage, findOrCreateDirectConversation } from '../create.mts'
import { getConversationMessages } from '../get.mts'

describe('direct message provenance', () => {
  let oauthClientId: string

  beforeAll(async () => {
    oauthClientId = await insertContentProvenanceOAuthClient()
  })

  async function newConversation() {
    const [sender, recipient] = await Promise.all([createTestUser(), createTestUser()])
    const conversation = await findOrCreateDirectConversation(sender.id, recipient.id)
    return { sender, recipient, conversation }
  }

  it.each([
    ['a web session', () => ({ createdVia: 'web', oauthClientId: null }) as const],
    ['a native session', () => ({ createdVia: 'swift', oauthClientId: null }) as const],
    ['an API key', () => ({ createdVia: 'api', oauthClientId: null }) as const],
    ['an OAuth client over MCP', () => ({ createdVia: 'mcp', oauthClientId }) as const],
    ['an OAuth client over the API', () => ({ createdVia: 'api', oauthClientId }) as const],
    ['the platform', () => ({ createdVia: 'system', oauthClientId: null }) as const],
  ])('records the channel of %s on the message', async (_label, build) => {
    const provenance: ContentProvenance = build()
    const { sender, conversation } = await newConversation()

    const message = await createConversationMessage(
      sender.id,
      provenance,
      conversation.id,
      'Hello!',
    )

    await expect(readTestContentProvenance('conversation_messages', message.id)).resolves.toEqual(
      provenance,
    )
  })

  it('keeps provenance out of the created message and every read of it', async () => {
    const { sender, conversation } = await newConversation()

    const message = await createConversationMessage(
      sender.id,
      { createdVia: 'mcp', oauthClientId },
      conversation.id,
      'Hello!',
    )
    const messages = await getConversationMessages(conversation.id)

    expect(messages.map(row => row.id)).toEqual([message.id])
    expect(JSON.stringify({ message, messages })).not.toMatch(/created_?via|oauth/i)
  })

  it('selects only the public columns when creating and listing messages', async () => {
    const { sender, conversation } = await newConversation()

    const message = await createConversationMessage(
      sender.id,
      { createdVia: 'api', oauthClientId },
      conversation.id,
      'Hello!',
    )
    const [listed] = await getConversationMessages(conversation.id)

    expect(Object.keys(message).toSorted()).toEqual([
      'body_text',
      'conversation_id',
      'created_at',
      'created_by_id',
      'deleted_at',
      'id',
      'updated_at',
    ])
    expect(Object.keys(listed!).toSorted()).toEqual([
      'body_text',
      'conversation_id',
      'created_at',
      'created_by_id',
      'deleted_at',
      'id',
      'sender_username',
      'updated_at',
    ])
  })

  it('records each message with its own sender channel in one conversation', async () => {
    const { sender, recipient, conversation } = await newConversation()

    const [fromWeb, fromAgent] = await Promise.all([
      createConversationMessage(
        sender.id,
        { createdVia: 'web', oauthClientId: null },
        conversation.id,
        'From the web',
      ),
      createConversationMessage(
        recipient.id,
        { createdVia: 'mcp', oauthClientId },
        conversation.id,
        'From an agent',
      ),
    ])

    await expect(readTestContentProvenance('conversation_messages', fromWeb.id)).resolves.toEqual({
      createdVia: 'web',
      oauthClientId: null,
    })
    await expect(readTestContentProvenance('conversation_messages', fromAgent.id)).resolves.toEqual(
      {
        createdVia: 'mcp',
        oauthClientId,
      },
    )
  })

  it('stores nothing when the sender is not a participant', async () => {
    const { conversation } = await newConversation()
    const outsider = await createTestUser()

    await expect(
      createConversationMessage(
        outsider.id,
        { createdVia: 'web', oauthClientId: null },
        conversation.id,
        'Let me in',
      ),
    ).rejects.toMatchObject({ status: 403 })

    await expect(getConversationMessages(conversation.id)).resolves.toEqual([])
  })

  it('rejects an OAuth client on a channel that cannot name one', async () => {
    const { sender, conversation } = await newConversation()

    await expect(
      createConversationMessage(
        sender.id,
        { createdVia: 'web', oauthClientId } as unknown as ContentProvenance,
        conversation.id,
        'Hello!',
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
