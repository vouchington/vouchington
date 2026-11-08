import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { DirectMessage } from './types.mts'
import { conversationMessageInsert } from './conversation-message-insert.mts'

/** A new participant is durable only when their first message commits. */
export async function createMessageWithAdmission(
  currentUserId: string,
  provenance: ContentProvenance,
  conversationId: string,
  bodyText: string,
  beforeInsert: (query: TransactionQuery) => Promise<void>,
): Promise<DirectMessage | undefined> {
  await using query = await beginTransaction()
  await beforeInsert(query)
  const { rows } = await query<DirectMessage>(
    conversationMessageInsert(currentUserId, provenance, conversationId, bodyText),
  )
  const message = rows[0]
  if (!message) return undefined
  await query.commit()
  return message
}
