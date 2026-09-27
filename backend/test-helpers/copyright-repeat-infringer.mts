import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import type { PrivateUser } from '@services/users/types'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightAppeal,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  reviewCopyrightAppeal,
} from '@services/copyright-notices'
import { getTestPostImagePlacement } from './entities/post-images.mts'
import { insertTestPost } from './entities/posts.mts'
import { insertTestImage, insertTestPostImage } from './entities/images.mts'
import { pollUntilNotNull } from './polling.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

export async function createTestRepeatInfringerNotice(ownerIds: string[], moderator: PrivateUser) {
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
        placementKey: `image-placement:${placement.placement_id}`,
        placementRevision: placement.placement_revision,
        imageId,
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
  const targetsByPlacement = new Map(
    aggregate.targets.map(target => [target.placement_key, target]),
  )
  for (const target of targets) {
    const saved = targetsByPlacement.get(target.placementKey)
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

export async function confirmTestRepeatInfringerRestriction(
  fixture: Awaited<ReturnType<typeof createTestRepeatInfringerNotice>>,
  moderator: PrivateUser,
  index = 0,
) {
  return completeCopyrightMandatoryHumanReview({
    currentUser: moderator,
    noticeId: fixture.noticeId,
    restrictionId: fixture.restrictions[index]!.id,
    action: 'confirm',
    rationale: 'The reviewed restriction is appropriate.',
    reviewedAt: new Date(),
  })
}

export async function reviewTestRepeatInfringerAppeal(
  fixture: Awaited<ReturnType<typeof createTestRepeatInfringerNotice>>,
  poster: PrivateUser,
  moderator: PrivateUser,
  action: 'confirm' | 'reverse',
  index = 0,
) {
  const restriction = fixture.restrictions[index]!
  const appeal = await createCopyrightAppeal(poster, fixture.noticeId, crypto.randomUUID(), {
    reason: 'Please review the restriction.',
    targetIds: [restriction.targetId],
  })
  return reviewCopyrightAppeal({
    submissionId: appeal.submission.id,
    currentUser: moderator,
    recommendationId: null,
    manualFallbackReason: 'The record supports a manual review.',
    rationale: 'The evidence was reviewed.',
    decisions: [{ restrictionId: restriction.id, action }],
  })
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
    await lockAuthorPublicationLifecycle(transaction, accountId)
    const pid = await getTestPostgresBackendProcessId(transaction)
    outcomes = Promise.allSettled(operations.map(operation => operation()))
    const blocked = await pollUntilNotNull(
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
    )
    if (!blocked) throw new Error('Both confirmation transactions did not reach the author lock')
    await transaction.commit()
  }
  const results = await outcomes
  for (const result of results) if (result.status === 'rejected') throw result.reason
}
