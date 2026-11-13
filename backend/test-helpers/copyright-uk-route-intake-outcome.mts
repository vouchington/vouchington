import { AsyncResource } from 'node:async_hooks'
import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { createRequest } from './api/server.mts'
import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { copyrightHttpSerializationAbort } from './copyright-owned-http-serialization.mts'

type CommittedUkReceipt = {
  notice_id: string
  receipt_id: string
  acknowledgment_id: string
  route_destination: string
}

/** Receipt commit precedes the one real acknowledgment; capture that boundary without changing it. */
export async function assertUkRouteIntake(input: {
  request: ReturnType<typeof createRequest>
  claimantId: string
  key: string
  body: { contact: string; content_description: string; grounds: string; hosted_use_url: string }
  duplicate: boolean
}) {
  let receiptConnection: object | undefined
  let captured = input.duplicate
  let receipt: CommittedUkReceipt | undefined
  let before: Awaited<ReturnType<typeof readCopyrightApiTerritorialState>> | undefined
  if (input.duplicate) {
    receipt = await readUkRouteCommittedReceipt(input.claimantId, input.key)
    before = await readCopyrightApiTerritorialState(receipt.notice_id)
  }
  const owned = new Set<object>()
  const failures: Array<{ connection?: object; values: readonly unknown[]; code: unknown }> = []
  const snapshotScope = new AsyncResource('copyright-uk-route-snapshot')
  const observed = await observeTestPostgresClientQueries(
    async () =>
      input.request
        .post('/api/v1/copyright-uk-notices')
        .set('Idempotency-Key', input.key)
        .send(input.body),
    async query => {
      if (
        query.text.includes('/* receiveTerritorialCopyrightNotice:existing */') &&
        query.values.includes(input.key)
      )
        receiptConnection = query.connection
      if (receipt && query.connection && query.values.includes(receipt.notice_id))
        owned.add(query.connection)
      if (
        !captured &&
        receiptConnection &&
        query.connection === receiptConnection &&
        /^(?:\/\*[\s\S]*?\*\/\s*)*COMMIT\b/i.test(query.text.trimStart())
      ) {
        captured = true
        await snapshotScope.runInAsyncScope(async () => {
          receipt = await readUkRouteCommittedReceipt(input.claimantId, input.key)
          before = await readCopyrightApiTerritorialState(receipt.notice_id)
        })
      }
    },
    (query, err) => {
      failures.push({
        connection: query.connection,
        values: query.values,
        code: (err as { code?: unknown } | null)?.code,
      })
    },
  ).finally(() => {
    snapshotScope.emitDestroy()
  })
  expect(observed.observerErrors).toEqual([])
  if (!captured || !receipt || !before)
    throw new Error('Intake omitted its owned receipt commit boundary')
  const committedReceipt = receipt
  const after = await readCopyrightApiTerritorialState(committedReceipt.notice_id)
  const nativeCodes = failures.flatMap(query =>
    query.values.includes(committedReceipt.notice_id) ||
    (query.connection && owned.has(query.connection))
      ? [query.code]
      : [],
  )
  const acknowledgment = before.acknowledgments[0]
  if (!acknowledgment || typeof acknowledgment.attempt_count !== 'number')
    throw new Error('Committed intake acknowledgment disappeared')
  if (acknowledgment.acknowledged_at !== null && !(acknowledgment.acknowledged_at instanceof Date))
    throw new Error('Committed intake acknowledgment has an invalid delivery timestamp')
  const at = after.acknowledgments[0]?.last_attempt_at
  if (at !== null && !(at instanceof Date))
    throw new Error('Owned intake acknowledgment has an invalid attempt timestamp')
  const alreadyAcknowledged = acknowledgment.acknowledged_at !== null
  const attempts = acknowledgment.attempt_count + (alreadyAcknowledged ? 0 : 1)
  const successState = alreadyAcknowledged
    ? before
    : {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        acknowledgments: [
          {
            ...acknowledgment,
            attempt_count: attempts,
            last_attempt_at: expect.any(Date),
            acknowledged_at: at,
            updated_at: expect.any(Date),
          },
        ],
      }
  const response = observed.result
  expect([
    { outcome: { ...copyrightHttpSerializationAbort, receipt: undefined }, state: before },
    {
      outcome: {
        status: input.duplicate ? 200 : 201,
        code: undefined,
        message: undefined,
        nativeCodes: [],
        receipt: {
          ...committedReceipt,
          route_destination: 'staff_queue',
          is_duplicate: input.duplicate,
        },
        value: {
          id: acknowledgment.id,
          attempt_count: attempts,
          last_attempt_at: at?.toISOString(),
          acknowledged_at: at?.toISOString(),
          exhausted_at: null,
          escalated: false,
          ...(alreadyAcknowledged ? { requester_user_id: input.claimantId } : {}),
        },
      },
      state: successState,
    },
  ]).toContainEqual({
    outcome: {
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value: response.body.acknowledgment,
      receipt: response.body.copyright_uk_notice,
      nativeCodes,
    },
    state: after,
  })
  return committedReceipt.notice_id
}

async function readUkRouteCommittedReceipt(claimantId: string, key: string) {
  const { rows } = await write<CommittedUkReceipt>(sql`
    /* readUkRouteCommittedReceipt */ SELECT receipt.copyright_notice_id AS notice_id,
      receipt.id AS receipt_id, acknowledgment.id AS acknowledgment_id,
      routing.destination AS route_destination
    FROM copyright_territorial_notice_receipts receipt
    JOIN copyright_territorial_notice_acknowledgments acknowledgment
      ON acknowledgment.copyright_territorial_notice_receipt_id = receipt.id
    JOIN copyright_territorial_notice_routings routing
      ON routing.copyright_territorial_notice_receipt_id = receipt.id
    WHERE receipt.jurisdiction = 'uk' AND receipt.requester_user_id = ${claimantId}
      AND receipt.idempotency_key = ${key}`)
  const receipt = rows[0]
  if (!receipt) throw new Error('Owned intake receipt did not commit')
  return receipt
}
