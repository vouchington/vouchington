import { randomUUID } from 'node:crypto'
import { BedrockEmbeddingsClient } from '@modules/aws/bedrock-runtime'
import { UnrecoverableError } from '@modules/queue-errors'
import type { SupportMessage } from '@voucha/types/entities/support-message'
import {
  insertTestSupportContact,
  insertTestSupportMessage,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import { insertCentralizedEmbeddingsBulk } from '../../centralized-table.mts'
import { sha256 } from '@modules/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { upsertSupportMessageEmbedding } from '../support-messages.mts'

async function insertMessage(bodyText: string): Promise<SupportMessage> {
  const contact = await insertTestSupportContact({
    emailAddress: `support-${randomUUID()}@example.test`,
  })
  const thread = await insertTestSupportThread({ supportContactId: contact.id })
  const inserted = await insertTestSupportMessage({
    supportThreadId: thread.id,
    bodyText,
  })
  const now = new Date()
  return {
    id: inserted.id,
    support_thread_id: thread.id,
    direction: 'inbound',
    body_text: bodyText,
    body_html: '',
    created_at: now,
    created_by_id: null,
    updated_at: now,
    email_message_id: null,
    email_subject: null,
    email_from: null,
    email_to: null,
    drafted_at: null,
    edited_at: null,
    edited_by_id: null,
    approved_at: null,
    approved_by_id: null,
    sent_at: null,
  }
}

function stubBedrockEmbedding(body: unknown) {
  const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
    body: new TextEncoder().encode(JSON.stringify(body)),
  })
  Object.defineProperty(BedrockEmbeddingsClient, 'send', {
    value: send,
    configurable: true,
  })
  return send
}

describe('upsertSupportMessageEmbedding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('SQL-copies a centralized cache-hit vector onto the support message', async () => {
    const bodyText = `Cache hit ${randomUUID()}`
    const message = await insertMessage(bodyText)
    const embedding = new Array(1024).fill(0.25)
    await insertCentralizedEmbeddingsBulk([
      { content_sha256: sha256(bodyText), embedding, input_token_count: 3 },
    ])

    await expect(upsertSupportMessageEmbedding(message)).resolves.toBeUndefined()
    await expect(upsertSupportMessageEmbedding(message)).resolves.toBeUndefined()
  })

  it('writes a Bedrock dense vector onto the support message', async () => {
    const bodyText = `Bedrock ${randomUUID()}`
    const message = await insertMessage(bodyText)
    stubBedrockEmbedding({ embedding: new Array(1024).fill(0.25), inputTokenCount: 4 })

    await expect(upsertSupportMessageEmbedding(message)).resolves.toBeUndefined()
  })

  it('throws UnrecoverableError when Bedrock returns a non-array embedding', async () => {
    const bodyText = `Bad vector ${randomUUID()}`
    const message = await insertMessage(bodyText)
    stubBedrockEmbedding({ embedding: { float32: [0.1] } })

    await expect(upsertSupportMessageEmbedding(message)).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('throws UnrecoverableError when Bedrock returns a length-matched non-numeric vector', async () => {
    const bodyText = `Bad element ${randomUUID()}`
    const message = await insertMessage(bodyText)
    const embedding: unknown[] = new Array(1024).fill(0.25)
    embedding[0] = '0.25'
    stubBedrockEmbedding({ embedding })

    await expect(upsertSupportMessageEmbedding(message)).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
