import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read } from '@data-stores/psql'
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
  const { rows } = await read<{ id: string }>(
    allowUnannotatedQuery(sql`
    SELECT id FROM copyright_repeat_infringer_reviews
    WHERE account_user_id = ${accountId} AND outcome IS NULL
  `),
  )
  return rows.map(row => row.id)
}
