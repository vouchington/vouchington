import type { getSupportMessagesByThreadId } from '@services/customer-support'
import type { SupportAgentRun, SupportMessage } from '@services/customer-support/types'

export async function reloadKeyedSupportContext(
  threadId: string,
  agentRun: SupportAgentRun,
  getMessagesByThreadId: typeof getSupportMessagesByThreadId,
): Promise<SupportMessage[]> {
  const { results } = await getMessagesByThreadId(threadId, {
    limit: 20,
    atOrBeforeMessageId: agentRun.support_message_id,
    readOnly: false,
  })
  const inbound = results.find(message => message.id === agentRun.support_message_id)
  if (!inbound || inbound.direction !== 'inbound') {
    throw new Error(
      `generateSupportResponse: triggering inbound message is unavailable: ${agentRun.support_message_id}`,
    )
  }
  return results
}
