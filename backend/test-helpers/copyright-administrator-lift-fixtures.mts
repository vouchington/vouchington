import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect } from './entities/users.mts'
import { getTestImageSurfacePlacements } from './entities/image-surface-placements.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { createTestCopyrightImageFixture } from './copyright-surface-target-fixtures.mts'
import { resolveCopyrightImagePlacement } from '../services/copyright-notices/placement-resolution.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
import { createCopyrightStatementDeliveryInTransaction } from '../services/copyright-notices/statement-delivery.mts'
import { copyrightActionDeliveryFacts } from '../services/copyright-notices/action-delivery-facts.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../services/copyright-notices/staydown-registration.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from '../services/copyright-notices/restoration-reversal.mts'
import {
  anyReversalSourceSql,
  reverseReviewSourceSql,
  appealReversalSourceSql,
  administratorLiftSourceSql,
} from '../services/copyright-notices/restriction-reversal-sources-sql.mts'

export type LiftSurfaceFixture = Awaited<ReturnType<typeof createTestCopyrightImageFixture>>

/** Creates one assessed notice for one or more current image placements. */
export async function createTestLiftNotice(
  fixtures: LiftSurfaceFixture[],
  options: { claimantUserId?: string; claimantEmail?: string } = {},
) {
  const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
  const targets = await Promise.all(
    fixtures.map(fixture => resolveCopyrightImagePlacement(fixture.selector)),
  )
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: options.claimantUserId ?? null,
    claimantDisplayName: 'Test claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `Test work ${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'staff',
      bodyCiphertext: `body-${crypto.randomUUID()}`,
    },
    targets,
  })
  if (options.claimantEmail)
    await createTestLiftClaimantReceipt(notice.id, options.claimantEmail, options.claimantUserId)
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Notice fixture disappeared')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restrictions = []
  for (const target of aggregate.targets) {
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: moderator.id,
    })
    restrictions.push(restriction)
  }
  const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!restricted) throw new Error('Restricted notice fixture disappeared')
  return {
    noticeId: notice.id,
    moderator,
    targets: aggregate.targets,
    restrictions,
    actionIntents: restricted.actionIntents,
  }
}

/** Rebinds a detached community image through its database trigger, without an application actor. */
export async function reactivateTestCommunityImageWithoutBinder(fixture: LiftSurfaceFixture) {
  if (
    fixture.selector.surfaceKind !== 'community-profile-image' &&
    fixture.selector.surfaceKind !== 'community-banner-image'
  )
    throw new Error('Expected community image')
  await fixture.detach()
  const column =
    fixture.selector.surfaceKind === 'community-profile-image'
      ? sql`profile_image_id`
      : sql`banner_image_id`
  const statement = sql`/* reactivateTestCommunityImageWithoutBinder */ UPDATE communities SET `
  statement.append(column).append(sql` = ${fixture.imageId} WHERE id = ${fixture.ownerId}`)
  await write(statement)
  const placements = await getTestImageSurfacePlacements({
    communityId: fixture.ownerId,
    imageId: fixture.imageId,
    surfaceKind: fixture.selector.surfaceKind,
  })
  const live = placements.find(placement => placement.retired_at === null)
  if (!live) throw new Error('Trigger did not reactivate community image')
  return live
}

/** Seeds the same durable receipt shape the claimant-decision email reader consults. */
export async function createTestLiftClaimantReceipt(
  noticeId: string,
  claimantEmail: string,
  claimantUserId?: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await createCopyrightStatementDeliveryInTransaction(
    {
      noticeId,
      recipientUserId: claimantUserId ?? null,
      recipientRole: 'claimant',
      recipientEmail: claimantEmail,
      deliveryKind: 'claimant_receipt',
      correspondenceKind: 'receipt',
      key: `copyright-lift-fixture-receipt:${noticeId}`,
      text: 'We received your copyright notice.',
    },
    transaction,
  )
  await transaction.commit()
}

export async function readTestLiftDeliveryIntents(noticeId: string) {
  const { rows } = await read<{
    id: string
    delivery_kind: string
    channel: string
    recipient_user_id: string | null
    recipient_role: string
    target_path: string | null
  }>(sql`/* readTestLiftDeliveryIntents */
    SELECT id, delivery_kind, channel, recipient_user_id, recipient_role, target_path
    FROM copyright_notice_delivery_intents
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  return rows
}

/** Reads the exact worker facts for a pending reversal, without reimplementing source SQL. */
export async function readTestLiftReversalFacts(restrictionId: string) {
  const query = copyrightActionDeliveryFacts().append(sql`
    WHERE intent.copyright_restriction_id = ${restrictionId} AND intent.action = 'restore'
    ORDER BY intent.id DESC LIMIT 1
  `)
  const { rows } = await read<{
    reversal_authorized: boolean
    reversal_by_review: boolean
    reversal_by_appeal: boolean
    reversal_by_administrator_lift: boolean
  }>(query)
  return rows[0] ?? null
}

/** Reads the source predicates even before a restore intent exists. */
export async function readTestLiftSourceFlags(restrictionId: string) {
  const statement = sql`/* readTestLiftSourceFlags */ SELECT `
    .append(anyReversalSourceSql)
    .append(sql` AS reversal_authorized, `)
    .append(reverseReviewSourceSql)
    .append(sql` AS reversal_by_review, `)
    .append(appealReversalSourceSql)
    .append(sql` AS reversal_by_appeal, `)
    .append(administratorLiftSourceSql).append(sql` AS reversal_by_administrator_lift
      FROM copyright_restrictions restriction WHERE restriction.id = ${restrictionId}`)
  const { rows } = await read<{
    reversal_authorized: boolean
    reversal_by_review: boolean
    reversal_by_appeal: boolean
    reversal_by_administrator_lift: boolean
  }>(statement)
  return rows[0] ?? null
}

export async function replayTestLiftConfirmationConsequences(noticeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await applyCopyrightConfirmationConsequencesInTransaction(noticeId, transaction)
  await transaction.commit()
}

/** Exercises the production reversal guard inside a real transaction. */
export async function testCreateCopyrightRestoreIntentForReversal(restrictionId: string) {
  await using transaction = await beginTransaction()
  return await createCopyrightRestoreIntentForReversalInTransaction(restrictionId, transaction)
}
