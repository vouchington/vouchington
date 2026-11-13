import { read, write } from '@data-stores/psql'
import { createTestUser } from './entities/users.mts'
import {
  createDeliveredMembershipEffectForRetention,
  createEndedMembershipRenewalNoticeForRetention,
} from './membership-operational-retention.mts'
import sql from 'sql-template-strings'
import { createClassifierFixture } from './data-stores/psql/classifiers.mts'
import { seedOldClassifierDefaultDecision } from './classifier-default-retention.mts'
import { seedDeletedSubjectClassifierRequest } from './classifier-request-retention.mts'
import { seedClassifierRunPayloadsAt } from './classifier-retention.mts'
import { createSyntheticFixture } from './data-stores/psql/classifier-runs/synthetic-classifier.mts'
import { createCopyrightNoticeSchemaFixture } from './data-stores/psql/copyright-notice-schema.mts'
import { createRetentionSignedInForm } from './services/copyright-notices/retention-signed-in-form.mts'
import {
  createCopyrightRetentionScopes,
  seedCopyrightFormScreeningAttemptPair,
} from './copyright-operational-retention.mts'

export async function createContinuationRunFixture() {
  const setup = await createSyntheticFixture()
  const at = new Date('2001-01-01T00:00:00Z')
  const runs = await seedClassifierRunPayloadsAt({
    slug: setup.slug,
    postId: setup.post.id,
    actorId: setup.actorId,
    currentInputSha256: setup.post.inputSha256,
    at,
    terminalCount: 4,
  })
  return { ...runs, now: new Date('2002-01-01T00:00:00Z') }
}

export async function createIndependentClassifierContinuationFixture() {
  const fixture = await createClassifierFixture()
  const at = new Date('2001-01-01T00:00:00Z')
  const batches = [
    await seedOldClassifierDefaultDecision(fixture, at),
    await seedOldClassifierDefaultDecision(fixture, at),
    await seedOldClassifierDefaultDecision(fixture, at),
    await seedOldClassifierDefaultDecision(fixture, at),
  ]
  const requests = [
    await seedDeletedSubjectClassifierRequest({
      classifierId: fixture.classifierId,
      subject: 'post',
      settled: false,
      requestAt: at,
    }),
    await seedDeletedSubjectClassifierRequest({
      classifierId: fixture.classifierId,
      subject: 'rss_feed_item',
      settled: true,
      requestAt: at,
    }),
    await seedDeletedSubjectClassifierRequest({
      classifierId: fixture.classifierId,
      subject: 'post',
      settled: false,
      requestAt: at,
    }),
  ]
  const { rows } = await read<{ input_sha256: Buffer }>(
    sql`/* snapshotContinuationRequest */ SELECT input_sha256 FROM classifier_run_requests WHERE id = ${requests[0]!.requestId}`,
  )
  return {
    batches,
    requests,
    now: new Date('2002-01-01T00:00:00Z'),
    async rearmRequest() {
      await write(
        sql`/* rearmCompletedContinuationRequest */
          INSERT INTO classifier_run_requests (id, classifier_id, post_id, input_sha256)
          VALUES (${requests[0]!.requestId}, ${fixture.classifierId}, ${requests[0]!.identityId}, ${rows[0]!.input_sha256})`,
      )
    },
  }
}

export async function readContinuationRequestIds(ids: readonly string[]) {
  const { rows } = await read<{ id: string }>(
    sql`/* readContinuationRequestIds */ SELECT id FROM classifier_run_requests WHERE id = ANY(${[...ids]}::uuid[]) ORDER BY id`,
  )
  return rows.map(row => row.id)
}

export async function createDailyCopyrightContinuationFixture() {
  const notice = await createCopyrightNoticeSchemaFixture()
  const intake = await createRetentionSignedInForm(notice.actorUserId)
  const first = await seedCopyrightFormScreeningAttemptPair(intake.id)
  const second = await seedCopyrightFormScreeningAttemptPair(intake.id)
  const outside = await seedCopyrightFormScreeningAttemptPair(intake.id)
  const { rows } = await read<{ terminal_at: Date }>(sql`/* dailyCopyrightContinuationClock */
    SELECT max(failed_at) AS terminal_at FROM copyright_notice_form_screening_attempts
    WHERE id = ANY(${[first.priorId, first.latestId, second.priorId, second.latestId, outside.priorId, outside.latestId]}::uuid[])`)
  return {
    copyrightScopes: createCopyrightRetentionScopes({
      copyrightFormScreeningAttempts: [first.priorId, second.priorId],
    }),
    ids: [first.priorId, second.priorId],
    outsideId: outside.priorId,
    now: new Date(rows[0]!.terminal_at.getTime() + 181 * 86_400_000),
  }
}

/** Recreate one completed effect so a restarted family would visibly delete it. */
export async function rearmMembershipEffectForContinuation(
  effectId: string,
  changeId: string,
  userId: string,
  at: Date,
): Promise<void> {
  await write(sql`/* rearmMembershipEffectForContinuation */
    INSERT INTO membership_entitlement_effects (id, membership_change_id, user_id, delivered_at)
    VALUES (${effectId}, ${changeId}, ${userId}, ${at})`)
}

/** Observe fields actually removed by each membership retention sweep. */
export async function readMembershipContinuationOutsideState(
  effectId: string,
  membershipId: string,
) {
  const { rows } = await read(sql`/* readMembershipContinuationOutsideState */ SELECT
    (SELECT to_jsonb(effect) FROM membership_entitlement_effects effect
      WHERE effect.id = ${effectId}) AS effect,
    (SELECT to_jsonb(notice) FROM membership_renewal_price_increase_notification_work_items notice
      WHERE notice.membership_id = ${membershipId}) AS notice`)
  return rows
}

/** The two scoped membership families share one continuation while retaining excluded neighbors. */
export async function createMembershipContinuationFixture() {
  const at = new Date('2001-01-01T00:00:00Z')
  const now = new Date('2002-01-01T00:00:00Z')
  const effectUser = await createTestUser()
  const firstEffect = await createDeliveredMembershipEffectForRetention(effectUser.id, at)
  const secondEffect = await createDeliveredMembershipEffectForRetention(
    (await createTestUser()).id,
    at,
  )
  const firstNotice = await createEndedMembershipRenewalNoticeForRetention(
    (await createTestUser()).id,
    at,
  )
  const secondNotice = await createEndedMembershipRenewalNoticeForRetention(
    (await createTestUser()).id,
    at,
  )
  const thirdNotice = await createEndedMembershipRenewalNoticeForRetention(
    (await createTestUser()).id,
    at,
  )
  const outsideEffect = await createDeliveredMembershipEffectForRetention(
    (await createTestUser()).id,
    at,
  )
  const outsideNotice = await createEndedMembershipRenewalNoticeForRetention(
    (await createTestUser()).id,
    at,
  )
  const outsideBefore = await readMembershipContinuationOutsideState(
    outsideEffect.effectId,
    outsideNotice,
  )
  const options = {
    retention: {
      families: ['deliveredMembershipEntitlementEffects', 'endedMembershipRenewalNotices'] as const,
      deliveredMembershipEntitlementEffects: {
        recordIds: [firstEffect.effectId, secondEffect.effectId],
        now,
        batchSize: 1,
        maxBatches: 1,
      },
      endedMembershipRenewalNotices: {
        recordIds: [firstNotice, secondNotice, thirdNotice],
        now,
        batchSize: 1,
        maxBatches: 1,
      },
    },
  }
  return {
    at,
    effectUser,
    firstEffect,
    secondEffect,
    firstNotice,
    secondNotice,
    thirdNotice,
    outsideEffect,
    outsideNotice,
    outsideBefore,
    options,
  }
}
