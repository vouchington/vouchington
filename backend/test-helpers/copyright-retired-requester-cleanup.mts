import { read, writePool } from '@data-stores/psql'
import type pg from 'pg'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readRetiredCopyrightRequesterState } from './copyright-thread-preservation-fixture.mts'

/** Complete retained rows and the live account/FK rows touched by this owned minimal purge. */
export async function readRetiredRequesterCleanupState(
  noticeId: string,
  intakeId: string,
  userId: string,
) {
  const [{ rows }, retained, aggregate] = await Promise.all([
    read<{
      account: Record<string, unknown> | null
      identity: Record<string, unknown>
      notice: Record<string, unknown>
      intake: Record<string, unknown>
      submissions: Array<Record<string, unknown>>
      emails: Array<Record<string, unknown>>
      generation: string
    }>(sql`/* readRetiredRequesterCleanupState */ SELECT
      (SELECT generation::text FROM copyright_notice_thread_party_generations
        WHERE copyright_notice_id = ${noticeId}) AS generation,
      (SELECT to_jsonb(account) FROM users account WHERE id = ${userId}) AS account,
      (SELECT to_jsonb(identity) - 'purged_at' || jsonb_build_object('purged', purged_at IS NOT NULL)
        FROM retained_user_identities identity WHERE id = ${userId}) AS identity,
      (SELECT to_jsonb(notice) FROM copyright_notices notice WHERE id = ${noticeId}) AS notice,
      (SELECT to_jsonb(intake) FROM copyright_notice_form_intakes intake WHERE id = ${intakeId}) AS intake,
      (SELECT COALESCE(jsonb_agg(to_jsonb(submission) ORDER BY id), '[]'::jsonb)
        FROM copyright_notice_submissions submission WHERE copyright_notice_id = ${noticeId}) AS submissions,
      (SELECT COALESCE(jsonb_agg(to_jsonb(email) ORDER BY id), '[]'::jsonb)
        FROM user_email_addresses email WHERE user_id = ${userId}) AS emails`),
    readRetiredCopyrightRequesterState(noticeId, intakeId, userId),
    getCopyrightNoticePrivateAggregate(noticeId),
  ])
  const row = rows[0]
  if (!row || !aggregate) throw new Error('Owned requester cleanup state is missing')
  return { ...row, retained, aggregate }
}

export function completedRetiredRequesterCleanupState(
  before: Awaited<ReturnType<typeof readRetiredRequesterCleanupState>>,
  userId: string,
) {
  return {
    ...before,
    generation: String(
      BigInt(before.generation) +
        BigInt(
          Number(before.notice.claimant_user_id === userId) +
            before.submissions.filter(row => row.submitted_by_id === userId).length,
        ),
    ),
    aggregate: {
      ...before.aggregate,
      notice: { ...before.aggregate.notice, claimant_user_id: null },
      deliveryIntents: before.aggregate.deliveryIntents.map(row => ({
        ...row,
        recipient_user_id: row.recipient_user_id === userId ? null : row.recipient_user_id,
      })),
      submissions: before.aggregate.submissions.map(row => ({
        ...row,
        submitted_by_id: row.submitted_by_id === userId ? null : row.submitted_by_id,
      })),
    },
    account: null,
    identity: { ...before.identity, purged: true, is_copyright_case_clock_sync_pending: true },
    notice: {
      ...before.notice,
      claimant_user_id: null,
      updated_at: expect.toSatisfy(
        (value: unknown) =>
          typeof value === 'string' &&
          Number.isFinite(Date.parse(value)) &&
          Date.parse(value) >= Date.parse(String(before.notice.updated_at)),
      ),
    },
    intake: { ...before.intake, requester_user_id: null },
    submissions: before.submissions.map(row => ({
      ...row,
      submitted_by_id: row.submitted_by_id === userId ? null : row.submitted_by_id,
    })),
    emails: [],
    retained: { ...before.retained, requester_id: null },
  }
}

/** Observe the native client without replacing the metadata-bearing TransactionQuery facade. */
export function abortRetiredRequesterPurgeAfterDelete(
  userId: string,
  phase: 'delete' | 'archive' = 'delete',
) {
  let observedCode: string | undefined
  let injected = false
  const clients = new Map<pg.PoolClient, { owned: boolean; restore: () => void }>()
  const observe = (client: pg.PoolClient) => {
    const previous = clients.get(client)
    if (previous) {
      previous.owned = false
      return
    }
    const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
    const original = client.query
    const state = {
      owned: false,
      restore: () => {
        if (descriptor) Object.defineProperty(client, 'query', descriptor)
        else Reflect.deleteProperty(client, 'query')
      },
    }
    clients.set(client, state)
    const wrapped = ((...args: unknown[]) => {
      const [input, parameters] = args
      const statement =
        typeof input === 'string'
          ? input
          : typeof input === 'object' && input !== null && 'text' in input
            ? String(input.text)
            : ''
      const values =
        typeof input === 'object' &&
        input !== null &&
        'values' in input &&
        Array.isArray(input.values)
          ? input.values
          : Array.isArray(parameters)
            ? parameters
            : []
      state.owned ||= values.includes(userId)
      const pending = Reflect.apply(original, client, args)
      if (args.some(arg => typeof arg === 'function')) return pending
      return Promise.resolve(pending)
        .then(async result => {
          if (
            !injected &&
            values.includes(userId) &&
            statement.includes(
              phase === 'delete'
                ? 'cleanupSoftDeletedUserBatch:delete'
                : 'cleanupUserOwnedCommunities:removeArchivedOwners',
            )
          ) {
            injected = true
            await Reflect.apply(original, client, [
              "DO $$ BEGIN RAISE EXCEPTION 'owned requester purge serialization fault' USING ERRCODE = '40001'; END $$",
            ])
          }
          return result
        })
        .catch((err: unknown) => {
          if (state.owned) observedCode = (err as { code?: string }).code
          throw err
        })
    }) as pg.PoolClient['query']
    Object.defineProperty(client, 'query', { configurable: true, writable: true, value: wrapped })
  }
  writePool.on('acquire', observe)
  return {
    observedCode: () => observedCode,
    restore: () => {
      writePool.off('acquire', observe)
      for (const state of clients.values()) state.restore()
    },
  }
}
