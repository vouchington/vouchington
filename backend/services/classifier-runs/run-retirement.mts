import { beginTransaction } from '@data-stores/psql'
import { settleClassifierRunRequest } from './run-requests.mts'
import type { ClassifierRunAdapter, ClassifierRunSubject } from './types.mts'

/** An unsettled request the adapter's sweep eligibility rejected, with the content it asked for. */
export type IneligibleClassifierRunRequest = {
  subject: ClassifierRunSubject
  inputSha256: Buffer
}

/**
 * Settles as stale the requests whose subject can no longer be classified at the content they
 * asked for, so the sweep stops selecting them. The adapter's own `lockCurrent` is the judge: a
 * subject it no longer returns (deleted, or not eligible for this classifier) or returns at other
 * content has left that content version for good. A subject it still returns at the requested
 * content is only waiting on something else (an embedding), so its request stays pending.
 *
 * Producers revive a retired request: re-approval and a same-content feed-item re-upsert re-arm
 * it, and a content change writes a new request. Each request is judged under the subject's lock
 * in its own transaction, the same order every producer takes, so a retirement never overwrites a
 * request a producer just re-armed.
 */
export async function retireIneligibleClassifierRunRequests<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  [request, ...rest]: readonly IneligibleClassifierRunRequest[],
): Promise<void> {
  if (!request) return
  await retireIfTerminal(adapter, request)
  await retireIneligibleClassifierRunRequests(adapter, rest)
}

async function retireIfTerminal<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  request: IneligibleClassifierRunRequest,
): Promise<void> {
  await using query = await beginTransaction()
  const current = await adapter.lockCurrent(query, request.subject)
  if (current?.inputSha256.equals(request.inputSha256)) return
  await settleClassifierRunRequest(query, adapter.slug, request.subject, {
    kind: 'stale',
    inputSha256: request.inputSha256,
  })
  await query.commit()
}
