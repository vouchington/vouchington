import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import {
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './entities/index.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { pollUntilNotNull } from './polling.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

export async function createTestRepeatInfringerNotice(
  ownerIds: string[],
  moderator: PrivateUser,
): Promise<{ noticeId: string; restrictions: Array<{ id: string; targetId: string }> }> {
  const targets = await Promise.all(
    ownerIds.map(async ownerId => {
      const postId = await insertTestPost({
        title: `copyright ${crypto.randomUUID()}`,
        slug: `copyright-${crypto.randomUUID()}`,
        createdById: ownerId,
        markdown: 'image',
      })
      const imageId = await insertTestImage(ownerId)
      await insertTestPostImage({ postId, imageId })
      const placement = await getTestPostImagePlacement(postId, imageId)
      if (!placement) throw new Error('Test placement missing')
      return {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post' as const,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      }
    }),
  )
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
    claimantContactCiphertext: crypto.randomUUID(),
    workDescription: crypto.randomUUID(),
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: crypto.randomUUID(),
    },
    targets,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Test notice missing')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restrictions = []
  const targetsByPlacement = new Map(aggregate.targets.map(target => [target.placement_id, target]))
  for (const target of targets) {
    const saved = targetsByPlacement.get(target.placementId)
    if (!saved) throw new Error('Test target missing')
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: saved.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    restrictions.push({ id: restriction.id, targetId: saved.id })
  }
  return { noticeId: notice.id, restrictions }
}

export async function getTestCopyrightRepeatInfringerReview(reviewId: string) {
  const { rows } = await read<{
    id: string
    opened_at: Date
    outcome: string | null
    outcome_at: Date | null
    created_at: Date
    updated_at: Date
  }>(sql`/* getTestCopyrightRepeatInfringerReview */
    SELECT id, opened_at, outcome, outcome_at, created_at, updated_at
    FROM copyright_repeat_infringer_reviews
    WHERE id = ${reviewId}
  `)
  return rows[0] ?? null
}

export async function readTestRepeatInfringerOpenReviewIds(accountId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`
    SELECT id FROM copyright_repeat_infringer_reviews
    WHERE account_user_id = ${accountId} AND outcome IS NULL
  `)
  return rows.map(row => row.id)
}

/** Holds the canonical author lock until both independent confirmation transactions reach sync. */
export async function confirmTestRepeatInfringerNoticesConcurrently(
  accountId: string,
  operations: Array<() => Promise<unknown>>,
): Promise<void> {
  let outcomes: Promise<PromiseSettledResult<unknown>[]>
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* confirmTestRepeatInfringerNoticesConcurrently:authorLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`author:${accountId.toLowerCase()}`}, 0))
    `)
    const pid = await getTestPostgresBackendProcessId(transaction)
    outcomes = Promise.allSettled(operations.map(operation => operation()))
    await pollUntilNotNull(
      async () => {
        const { rows } = await read<{ count: number }>(sql`
        SELECT count(*)::integer AS count FROM pg_stat_activity
        WHERE ${pid} = ANY(pg_blocking_pids(pid))
          AND query LIKE '%lockPostPublicationScope%'
      `)
        return rows[0]?.count === operations.length ? true : null
      },
      5_000,
      10,
      'both confirmation transactions to reach the author lock',
    )
    await transaction.commit()
  }
  const results = await outcomes
  for (const result of results) if (result.status === 'rejected') throw result.reason
}

export async function observeTestRepeatInfringerAuthorLock<Result, Observation>(input: {
  accountId: string
  operation: () => Promise<Result>
  observe: () => Promise<Observation>
}): Promise<{ result: Result; observation: Observation }> {
  let operation: Promise<Result>
  let observation: Observation
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* observeTestRepeatInfringerAuthorLock:authorLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`author:${input.accountId.toLowerCase()}`}, 0))
    `)
    const pid = await getTestPostgresBackendProcessId(transaction)
    operation = input.operation()
    await waitForTestPostgresLockWaiter(pid, 'lockPostPublicationScope')
    observation = await input.observe()
    await transaction.commit()
  }
  return { result: await operation, observation }
}

export async function raceTestRepeatInfringerAuthorLock(input: {
  accountId: string
  operations: Array<() => Promise<unknown>>
}): Promise<PromiseSettledResult<unknown>[]> {
  let outcomes: Promise<PromiseSettledResult<unknown>[]>
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* raceTestRepeatInfringerAuthorLock:authorLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`author:${input.accountId.toLowerCase()}`}, 0))
    `)
    const pid = await getTestPostgresBackendProcessId(transaction)
    const started: Array<Promise<unknown>> = []
    for (const operation of input.operations) {
      started.push(operation())
      await pollUntilNotNull(
        async () => {
          const { rows } = await read<{ count: number }>(sql`
            /* raceTestRepeatInfringerAuthorLock:waiters */
            SELECT count(*)::integer AS count FROM pg_stat_activity
            WHERE ${pid} = ANY(pg_blocking_pids(pid))
              AND query LIKE '%lockPostPublicationScope%'
          `)
          return rows[0]?.count === started.length ? true : null
        },
        5_000,
        10,
        'the operations to reach the author lifecycle lock',
      )
    }
    outcomes = Promise.allSettled(started)
    await transaction.commit()
  }
  return outcomes
}
