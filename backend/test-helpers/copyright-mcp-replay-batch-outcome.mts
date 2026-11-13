import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  observeTestPostgresClientQueries,
  type ObservedClientQuery,
} from './postgres-query-pool-observer.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'

type Batch = {
  body: Array<{
    id: number
    result?: {
      isError?: boolean
      structuredContent?: { replayed?: boolean }
      content?: Array<{ type: string; text?: string }>
    }
  }>
}
async function state(noticeId: string, intentId: string) {
  const [aggregate, clock, { rows }] = await Promise.all([
    getCopyrightNoticePrivateAggregate(noticeId),
    readCopyrightCaseLifecycleClock(noticeId),
    write(
      sql`/* copyrightMcpReplayBatch:work */ SELECT * FROM copyright_notice_action_work_items WHERE id = ${intentId}`,
    ),
  ])
  if (!aggregate || !rows[0]) throw new Error('Owned replay case disappeared')
  return { aggregate, clock, work: rows[0] }
}
/** Security admission/rationale commits independently; only the real replay may abort. */
export async function assertCopyrightMcpReplayBatch<Result extends Batch>(
  noticeId: string,
  intentId: string,
  actorId: string,
  operation: () => Promise<Result>,
) {
  const before = await state(noticeId, intentId)
  const failures: Array<{ query: ObservedClientQuery; code: unknown }> = []
  const observed = await observeTestPostgresClientQueries(operation, undefined, (query, err) => {
    failures.push({
      query,
      code: err && typeof err === 'object' && 'code' in err ? err.code : null,
    })
  })
  expect(observed.observerErrors).toEqual([])
  const replayConnections = new Set(
    observed.queries.flatMap(query =>
      query.text.includes('/* replayFailedCopyrightActionIntent */') &&
      query.values.includes(intentId) &&
      query.values.includes(noticeId)
        ? [query.connection]
        : [],
    ),
  )
  const ownedFailures = failures.filter(
    row => row.query.connection !== undefined && replayConnections.has(row.query.connection),
  )
  const results = [1, 2].map(id => {
    const reply = observed.result.body.find(row => row.id === id)?.result
    if (!reply) throw new Error('Owned MCP replay response missing')
    return reply.isError ? reply : reply.structuredContent
  })
  const conflict = {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: {
            status: 409,
            code: 'CONFLICT',
            message: 'Conflicting copyright case change',
            retryable: false,
          },
        }),
      },
    ],
  }
  const yes = { replayed: true }
  const no = { replayed: false }
  expect([
    [yes, no],
    [no, yes],
    [yes, conflict],
    [conflict, yes],
    [conflict, conflict],
  ]).toContainEqual(results)
  const errorCount = results.filter(row => row && 'isError' in row && row.isError).length
  expect(ownedFailures.map(row => row.code)).toEqual(
    Array.from({ length: errorCount }, () => '40001'),
  )
  expect(failures).toEqual(ownedFailures)
  const replayed = results.some(row => row && 'replayed' in row && row.replayed === true)
  const after = await state(noticeId, intentId)
  const newEvent = after.aggregate.lifecycleEvents.find(
    row => !before.aggregate.lifecycleEvents.some(prior => prior.id === row.id),
  )
  expect(after).toEqual(
    replayed
      ? {
          ...before,
          work: {
            ...before.work,
            state: 'pending',
            attempt_count: 0,
            leased_at: null,
            lease_token: null,
            lease_expires_at: null,
            completed_at: null,
            completed_at_reason: null,
            available_at: expect.any(Date),
            updated_at: expect.any(Date),
            generation: String(BigInt(String(before.work.generation)) + 1n),
            failure_message: 'Explicit operator replay after external delivery failure.',
          },
          clock: expect.any(Date),
          aggregate: {
            ...before.aggregate,
            actionIntents: before.aggregate.actionIntents.map(row =>
              row.id === intentId
                ? {
                    ...row,
                    state: 'pending',
                    generation: String(BigInt(String(before.work.generation)) + 1n),
                    updated_at: expect.any(Date),
                    attempt_count: 0,
                    lease_token: null,
                    leased_at: null,
                    completed_at: null,
                    completed_at_reason: null,
                    available_at: expect.any(Date),
                    failure_message: 'Explicit operator replay after external delivery failure.',
                  }
                : row,
            ),
            lifecycleEvents: [
              ...before.aggregate.lifecycleEvents,
              expect.objectContaining({
                id: newEvent?.id,
                change_type: 'copyright_action_replayed',
                changed_by_id: actorId,
                copyright_notice_action_intent_id: intentId,
                replay_reason: 'operator_replay',
              }),
            ],
          },
        }
      : before,
  )
  return { response: observed.result, errorCount }
}
