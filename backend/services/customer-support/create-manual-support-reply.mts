import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { createSupportMessage } from './create-support-message.mts'
import { lockSupportThread } from './lock-support-thread.mts'
import { getSupportThreadById } from './threads.mts'
import { enqueueSupportMessageEmbedding } from './enqueue-side-effects.mts'
import type { SupportMessage } from './types.mts'

export type CreateManualSupportReplyResult =
  | { status: 'created'; message: SupportMessage }
  | { status: 'not_found' | 'resolved' }

export async function createManualSupportReply(
  threadId: string,
  params: {
    bodyText: string
    bodyHtml?: string
    createdById: string
  },
  dependencies: { enqueueEmbedding?: (threadId: string, messageId: string) => unknown } = {},
): Promise<CreateManualSupportReplyResult> {
  await using query = await beginTransaction()

  const locked = await lockSupportThread(threadId, { query })
  if (!locked) {
    await query.commit()
    return { status: 'not_found' }
  }
  const thread = await getSupportThreadById(threadId, { query, readOnly: false })
  if (!thread) {
    await query.commit()
    return { status: 'not_found' }
  }
  if (thread.resolved_at) {
    await query.commit()
    return { status: 'resolved' }
  }
  const message = await createSupportMessage(
    threadId,
    {
      direction: 'outbound',
      bodyText: params.bodyText,
      bodyHtml: params.bodyHtml,
      createdById: params.createdById,
    },
    { query, skipEnqueue: true },
  )
  await query.commit()
  try {
    await (dependencies.enqueueEmbedding ?? enqueueSupportMessageEmbedding)(threadId, message.id)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
  return { status: 'created', message }
}
