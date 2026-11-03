import { randomBytes, randomUUID } from 'node:crypto'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/form-intakes.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from '../../../services/copyright-notices/form-screenings.mts'
import { appendTestCopyrightFormScreening } from '../../copyright-form-screenings.mts'
import {
  createTestCopyrightFormIntakeReview,
  liftTestCopyrightRestriction,
} from '../../data-stores/psql/copyright-form-reviews.mts'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../index.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'
import { reviewRetentionRestriction } from './retention-restriction-review.mts'
import { sendAllCopyrightDeliveries } from './retention-deliveries.mts'
import { testCopyrightFormGuidance } from './form-guidance.mts'
import { settleCopyrightCasePurgeFixtureActions } from './retention-case-purge-fixture.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './email-ses-verdicts.mts'

/** A reviewed form case whose exact request and idempotency key remain available to the test. */
export async function createReplayableCopyrightCasePurgeForm() {
  const [claimant, poster, moderatorRecord] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as PrivateUser
  const imageId = await insertTestImage(poster.id)
  const postId = await insertTestPost({
    title: `copyright purge replay ${randomUUID()}`,
    slug: `copyright-purge-replay-${randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const input = {
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: randomUUID(),
    request: {
      jurisdiction: 'us_dmca' as const,
      claimantDisplayName: 'Claimant Name',
      claimantContact: `claimant-${randomUUID()}@example.test`,
      claimantEmail: `claimant-${randomUUID()}@example.test`,
      workDescription: `Original photograph ${randomUUID()}`,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant Name',
      claimantTargets: [
        {
          surfaceKind: 'post-image' as const,
          postId,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    },
  }
  const created = await createCopyrightFormIntake(input)
  const intake = created.intake
  await appendTestCopyrightFormScreening({
    intakeId: intake.id,
    inputSha256: randomBytes(32),
    recommendation: 'not_obviously_invalid',
    rationale: `No obvious spam ${randomUUID()}.`,
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  await applyNonSpamSignedInCopyrightFormScreening(intake.copyright_notice_submission_id)
  await createTestCopyrightFormIntakeReview({
    intakeId: intake.id,
    moderatorId: moderator.id,
    is_accepted: true,
  })
  await reviewRetentionRestriction({
    noticeId: intake.copyright_notice_id,
    posterId: poster.id,
    moderator,
  })
  const restriction = (await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id))
    ?.restrictions[0]
  if (!restriction) throw new Error('Replay fixture restriction is missing')
  await liftTestCopyrightRestriction(restriction.id)
  await sendAllCopyrightDeliveries(intake.copyright_notice_id)
  await settleCopyrightCasePurgeFixtureActions(intake.copyright_notice_id)
  return { input, noticeId: intake.copyright_notice_id, intakeId: intake.id }
}

/** Reconstructs the original SES envelope from the intake and its immutable receipt. */
export async function readReplayableCopyrightCasePurgeEmail(intakeId: string) {
  const { rows } = await read<{
    amazon_ses_message_id: string
    received_at: Date
    storage_key: string
    raw_sha256: Buffer
    raw_mime_type: string
    raw_byte_size: number
  }>(sql`/* readReplayableCopyrightCasePurgeEmail */
    SELECT intake.amazon_ses_message_id, intake.received_at, object.storage_key,
      intake.raw_sha256, media.mime_type AS raw_mime_type, intake.raw_byte_size
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    JOIN media_types media ON media.id = intake.raw_media_type_id
    WHERE intake.id = ${intakeId}::uuid`)
  const row = rows[0]
  if (!row) throw new Error('Replay fixture email intake is missing')
  return {
    sesMessageId: row.amazon_ses_message_id,
    receivedAt: row.received_at,
    rawStorageKey: row.storage_key,
    rawSha256: row.raw_sha256,
    rawMimeType: row.raw_mime_type,
    rawByteSize: row.raw_byte_size,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  }
}
