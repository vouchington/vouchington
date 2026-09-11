import { beginTransaction, type QueryOptions } from '@data-stores/psql'
import assert from 'http-assert'
import {
  enqueueCustomerSupport,
  enqueueCustomerSupportAwaited,
} from '@queues/ai-agents/enqueues/customer-support'
import onError from '@modules/on-error'
import {
  getMemberSupportAgentJobId,
  reserveAutomaticSupportAgentIntent,
} from './automatic-support-agent-intent.mts'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'
import { createSupportMessage } from './create-support-message.mts'
import { createSupportThread } from './threads.mts'
import { enqueueSupportMessageEmbedding } from './enqueue-side-effects.mts'
import type { SupportMessage, SupportThread } from './types.mts'

export async function createSupportThreadWithInitialMessage(
  supportContactId: string,
  subject: string,
  options: {
    conversationId?: string
    message?: string
    agentModelName: AgentModel
    agentModelProvider: AgentModelProvider
  } & QueryOptions,
): Promise<{ thread: SupportThread; message: SupportMessage | null }> {
  const {
    conversationId,
    message: initialMessage,
    agentModelName,
    agentModelProvider,
    ...queryOptions
  } = options
  const normalizedMessage = initialMessage?.trim() || null

  await using query = await beginTransaction()

  const transactionOptions = { ...queryOptions, query }
  const thread = await createSupportThread(supportContactId, subject, {
    conversationId,
    ...transactionOptions,
    skipEnqueue: true,
  })
  assert(thread, 500, 'Failed to create support thread')

  if (!normalizedMessage) {
    await query.commit()
    void enqueueCustomerSupport(thread.id)
    return { thread, message: null }
  }
  const supportMessage = await createSupportMessage(
    thread.id,
    {
      direction: 'inbound',
      bodyText: normalizedMessage!,
    },
    { ...transactionOptions, skipEnqueue: true },
  )
  await reserveAutomaticSupportAgentIntent(
    {
      supportThreadId: thread.id,
      supportMessageId: supportMessage.id,
      modelName: agentModelName,
      modelProvider: agentModelProvider,
      input: { thread_subject: thread.subject, message_count: 1 },
    },
    transactionOptions,
  )

  await query.commit()
  void enqueueCustomerSupportAwaited(thread.id, {
    logicalJobId: getMemberSupportAgentJobId(supportMessage.id),
    supportMessageId: supportMessage.id,
  }).catch(onError)
  void enqueueSupportMessageEmbedding(thread.id, supportMessage.id)

  return { thread, message: supportMessage }
}
