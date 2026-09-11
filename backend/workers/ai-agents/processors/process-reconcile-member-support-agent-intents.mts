import { enqueueOrRetryBulkCustomerSupport } from '@queues/ai-agents/enqueues/customer-support'
import { listPendingMemberSupportAgentIntents } from '@services/customer-support/automatic-support-agent-intent'

export type ReconcileMemberSupportAgentIntentsDeps = {
  enqueueOrRetryBulkCustomerSupport: typeof enqueueOrRetryBulkCustomerSupport
  listPendingMemberSupportAgentIntents: typeof listPendingMemberSupportAgentIntents
}

const defaultDeps: ReconcileMemberSupportAgentIntentsDeps = {
  enqueueOrRetryBulkCustomerSupport,
  listPendingMemberSupportAgentIntents,
}

/**
 * Re-enqueues the durable member-created draft intents that survive a process crash after their
 * transaction commits but before their keyed GlideMQ enqueue completes. The service derives each
 * page from unfinished `support_agent_runs`; enqueueOrRetryBulkCustomerSupport retains the stable
 * message-derived ID and retries only its matching failed delivery.
 */
export async function processReconcileMemberSupportAgentIntents(
  dependencyOverrides: Partial<ReconcileMemberSupportAgentIntentsDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  let cursor: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the durable page fan-out finishes.
    const page = await deps.listPendingMemberSupportAgentIntents({
      ...(cursor ? { after: cursor } : {}),
    })
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once delivery before cursor advance.
    await deps.enqueueOrRetryBulkCustomerSupport(page.results)
    cursor = page.page_info.end_cursor ?? undefined
  } while (cursor)
}
