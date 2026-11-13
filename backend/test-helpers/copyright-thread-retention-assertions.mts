import { isDeepStrictEqual } from 'node:util'
import {
  observeTestPostgresClientQueries,
  type ObservedClientQuery,
} from './postgres-query-pool-observer.mts'
import type { CopyrightOperationalScope } from '../services/copyright-notices/operational-retention-cursor.mts'
import { expect } from 'vitest'
import { readCopyrightThreadOperationalCursor } from './copyright-operational-retention.mts'
import { readCopyrightThreadReferenceState } from './copyright-operational-email-retention.mts'
import { readCopyrightIntakeRetentionState } from './copyright-email-retention-state.mts'
import { readCopyrightThreadRetirementBound } from './copyright-thread-retention.mts'

type References = Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>
type Cursor = Awaited<ReturnType<typeof readCopyrightThreadOperationalCursor>>

export async function assertAbortedCaseThreadPage(
  noticeId: string,
  intakeId: string,
  references: References,
  cursor: Cursor,
  ancestorCount: number,
  scope: CopyrightOperationalScope,
): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).toBeNull()
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(references)
  expect(await readCopyrightThreadOperationalCursor(scope)).toEqual(cursor)
  expect((await readCopyrightIntakeRetentionState(intakeId)).ancestorCount).toBe(ancestorCount)
}

export async function assertIncompleteFinalThreadRun(
  noticeId: string,
  intakeId: string,
  before: References,
  after: References,
  result: { deleted: number; hasMore: boolean },
  cursorBefore: Cursor,
  beforeAncestorCount: number,
  scope: CopyrightOperationalScope,
): Promise<void> {
  expect(result.hasMore).toBe(false)
  expect(after.referenceCount).toBeGreaterThan(0)
  expect(after.referenceCount).toBeLessThanOrEqual(before.referenceCount)
  expect(await readCopyrightThreadRetirementBound(noticeId)).not.toBeNull()
  expect((await readCopyrightIntakeRetentionState(intakeId)).ancestorCount).toBeLessThanOrEqual(
    beforeAncestorCount,
  )
  if (result.deleted === 0) await assertUnchangedFinalCursor(before, after, cursorBefore, scope)
}

async function assertUnchangedFinalCursor(
  before: References,
  after: References,
  cursorBefore: Cursor,
  scope: CopyrightOperationalScope,
): Promise<void> {
  expect(after).toEqual(before)
  expect(await readCopyrightThreadOperationalCursor(scope)).toEqual(cursorBefore)
}

/** Attribute a real sweep abort to its owned query/checkout without replacing SQL. */
export async function observeOwnedCopyrightSweep<Result>(
  scope: CopyrightOperationalScope,
  operation: () => Promise<Result>,
) {
  const anchors = new WeakMap<object, { phase: string; ownedIds: string[] }>()
  const failures: { phase: string; ownerPhase: string; ownedIds: string[]; error: unknown }[] = []
  let pageCursor = structuredClone(scope.cursor)
  let abortedCursor: typeof pageCursor | undefined
  const ownedIds = (query: ObservedClientQuery) => {
    const ids = new Set<string>()
    for (const value of query.values) {
      const candidates = Array.isArray(value) ? value : [value]
      for (const id of candidates) {
        if (typeof id === 'string' && scope.recordIds.includes(id)) ids.add(id)
      }
    }
    return [...ids]
  }
  const phase = (query: ObservedClientQuery) => {
    const start = query.text.indexOf('/*')
    const end = query.text.indexOf('*/', start)
    return start >= 0 && end > start ? query.text.slice(start, end + 2) : 'transaction_control'
  }
  const observed = await observeTestPostgresClientQueries(
    operation,
    async query => {
      const ids = ownedIds(query)
      if (!ids.length) return
      if (query.connection) anchors.set(query.connection, { phase: phase(query), ownedIds: ids })
      if (
        query.text.includes('/* scanCopyrightThreadCase */') ||
        query.text.includes('/* scanCopyrightOperationalRetentionPage */') ||
        query.text.includes('/* scanUnlinkedCopyrightEmailIntake */')
      )
        pageCursor = structuredClone(scope.cursor)
    },
    (query, err) => {
      const ids = ownedIds(query)
      const anchor = ids.length
        ? { phase: phase(query), ownedIds: ids }
        : query.connection
          ? anchors.get(query.connection)
          : undefined
      if (!anchor) return
      failures.push({
        phase: phase(query),
        ownerPhase: anchor.phase,
        ownedIds: anchor.ownedIds,
        error: err,
      })
      abortedCursor = structuredClone(pageCursor)
    },
  )
  return {
    result: observed.result,
    failures,
    abortedCursor,
    observerErrors: observed.observerErrors ?? [],
  }
}

/** Successful retirement, or a witnessed native abort with its complete owned page rolled back. */
export async function assertOwnedCopyrightThreadSweep(input: {
  scope: CopyrightOperationalScope
  noticeId: string
  intakeId: string
  before: References
  observed: Awaited<ReturnType<typeof observeOwnedCopyrightSweep<{ deleted: number }>>>
}) {
  const { observed, scope } = input
  expect(observed.observerErrors).toEqual([])
  const native = expect.objectContaining({
    phase: expect.any(String),
    ownerPhase: expect.stringContaining('Copyright'),
    ownedIds: [input.noticeId],
    error: expect.objectContaining({ code: '40001' }),
  })
  const rollback = observed.failures.length
    ? isDeepStrictEqual(scope.cursor, observed.abortedCursor)
    : null
  expect([
    {
      deleted: true,
      references: { tokenId: null, referenceCount: 0 },
      marker: true,
      failures: [],
      rollback: null,
    },
    {
      deleted: true,
      references: { tokenId: null, referenceCount: 0 },
      marker: true,
      failures: [native],
      rollback: true,
    },
    { deleted: false, references: input.before, marker: false, failures: [native], rollback: true },
  ]).toContainEqual({
    deleted: observed.result.deleted > 0,
    references: await readCopyrightThreadReferenceState(input.intakeId),
    marker: (await readCopyrightThreadRetirementBound(input.noticeId)) !== null,
    failures: observed.failures,
    rollback,
  })
}
